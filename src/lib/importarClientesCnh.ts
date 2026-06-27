import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import pdfParse from "pdf-parse";

import { extrairLocatarioDocx } from "./contratoExtrair.js";
import { docxPlainText } from "./docxPlain.js";
import { defaultContratosDir, readLanzaPaths } from "./lanzaPaths.js";
import { listMotoristas } from "./rastreame/motorista.js";
import { motoristaToCliente, normCpfKey } from "./rastreame/mapMotoristaCliente.js";
import { REPO_ROOT } from "./repoRoot.js";

const CNH_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".jfif"]);
const RESID_RE =
  /(?:comprovante\s*(?:de\s*)?resid|resid[eê]ncia|declara[cç][aã]o\s*(?:de\s*)?resid)/i;
const CNH_RE = /(?:^|\b)cnh|habilita[cç][aã]o/i;

export type CnhArquivoEncontrado = {
  pastaContrato: string;
  pastaNome: string;
  cnhArquivo: string;
  contratoDocx: string | null;
  dataPasta: Date | null;
};

function parseDataPasta(nomePasta: string): Date | null {
  const m4 = nomePasta.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*/);
  if (m4) {
    const dt = new Date(Number(m4[3]), Number(m4[2]) - 1, Number(m4[1]), 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const m2 = nomePasta.match(/^(\d{2})\.(\d{2})\.(\d{2})(?!\d)\s*-\s*/);
  if (m2) {
    const yy = Number(m2[3]);
    const y = yy >= 50 ? 1900 + yy : 2000 + yy;
    const dt = new Date(y, Number(m2[2]) - 1, Number(m2[1]), 12, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function nomeDaPasta(nomePasta: string): string | null {
  const m = nomePasta.match(/^\d{2}\.\d{2}\.\d{2,4}\s*-\s*(.+)$/);
  return m ? m[1]!.trim() : null;
}

function isContractFolderName(name: string): boolean {
  return /^\d{2}\.\d{2}\.\d{2,4}\s*-\s*.+/.test(name);
}

function scoreCnhFile(name: string): number {
  const lower = name.toLowerCase();
  if (lower === "cnh-e.pdf") return 100;
  if (lower === "cnh.pdf") return 90;
  if (CNH_RE.test(name) && lower.endsWith(".pdf")) return 80;
  if (CNH_RE.test(name)) return 70;
  return 0;
}

function findContratoDocx(dir: string): string | null {
  try {
    const f = fs
      .readdirSync(dir)
      .find((x) => /^Contrato.*\.docx$/i.test(x) && !x.startsWith("~$"));
    return f ? path.join(dir, f) : null;
  } catch {
    return null;
  }
}

function findCnhFile(dir: string): string | null {
  let best: { path: string; score: number } | null = null;
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (!fs.statSync(full).isFile()) continue;
      const ext = path.extname(name).toLowerCase();
      if (!CNH_EXT.has(ext)) continue;
      const score = scoreCnhFile(name);
      if (score <= 0) continue;
      if (!best || score > best.score) best = { path: full, score };
    }
  } catch {
    return null;
  }
  return best?.path ?? null;
}

function* walkContractFolders(root: string): Generator<string> {
  if (!fs.existsSync(root)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    if (isContractFolderName(e.name)) {
      yield full;
      continue;
    }
    yield* walkContractFolders(full);
  }
}

export function listarPastasComCnh(roots: string[]): CnhArquivoEncontrado[] {
  const byKey = new Map<string, CnhArquivoEncontrado>();

  for (const root of roots) {
    for (const pasta of walkContractFolders(root)) {
      const cnh = findCnhFile(pasta);
      if (!cnh) continue;
      const pastaNome = path.basename(pasta);
      const nome = nomeDaPasta(pastaNome);
      if (!nome) continue;

      const item: CnhArquivoEncontrado = {
        pastaContrato: pasta,
        pastaNome,
        cnhArquivo: cnh,
        contratoDocx: findContratoDocx(pasta),
        dataPasta: parseDataPasta(pastaNome),
      };

      const key = normNomeKey(nome.replace(/\s*\([^)]*\)\s*$/g, ""));
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, item);
        continue;
      }
      const da = item.dataPasta?.getTime() ?? 0;
      const dp = prev.dataPasta?.getTime() ?? 0;
      if (da >= dp) byKey.set(key, item);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    (a.pastaNome || "").localeCompare(b.pastaNome || "", "pt-BR"),
  );
}

function formatCpf(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export type CnhTextoParse = {
  nome?: string;
  cpf?: string;
  cnh?: Record<string, string>;
};

/** Tenta extrair campos de CNH digital com camada de texto (muitos CNH-e são só imagem). */
export async function parseCnhArquivo(filePath: string): Promise<CnhTextoParse | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".pdf") return null;

  let text = "";
  try {
    const data = await pdfParse(fs.readFileSync(filePath));
    text = data.text || "";
  } catch {
    return null;
  }

  if (text.length < 80) return null;

  const out: CnhTextoParse = { cnh: {} };
  const cpfM = text.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
  if (cpfM) out.cpf = cpfM[1];

  const regM = text.match(/(?:REGISTRO|N[°º]\s*REGISTRO)\s*[:\s]*(\d{11})/i);
  if (regM) out.cnh!.numeroRegistro = regM[1];

  const catM = text.match(/\bCategoria\s*[:\s]*([ABCDE]{1,2})\b/i);
  if (catM) out.cnh!.categoria = catM[1]!.toUpperCase();

  const valM = text.match(/Validade\s*[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
  if (valM) out.cnh!.validade = valM[1];

  if (!out.cpf && !out.cnh?.numeroRegistro) return null;
  return out;
}

export type ClienteFromCnh = Record<string, unknown> & {
  nome: string;
  cpf?: string;
  cnhArquivo?: string;
  pastaContratoOrigem?: string;
};

export async function montarClienteFromPasta(item: CnhArquivoEncontrado): Promise<ClienteFromCnh | null> {
  const nomePasta = nomeDaPasta(item.pastaNome);
  if (!nomePasta) return null;

  let nome = nomePasta.replace(/\s*\([^)]*\)\s*$/g, "").trim();
  let cpf: string | undefined;
  let endereco: Record<string, string | null> | undefined;
  const cnh: Record<string, string> = {};

  if (item.contratoDocx && fs.existsSync(item.contratoDocx)) {
    const texto = docxPlainText(item.contratoDocx);
    const loc = extrairLocatarioDocx(texto);
    if (loc) {
      nome = loc.nome;
      cpf = loc.cpf;
      endereco = loc.endereco;
    }
  }

  const cnhParse = await parseCnhArquivo(item.cnhArquivo);
  if (cnhParse?.cpf) cpf = cnhParse.cpf;
  if (cnhParse?.cnh) Object.assign(cnh, cnhParse.cnh);

  if (!cpf) return null;

  return {
    nome,
    cpf,
    telefone: null,
    email: null,
    endereco: endereco ?? {
      cep: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: null,
      uf: null,
    },
    cnh: Object.keys(cnh).length ? cnh : undefined,
    cnhArquivo: item.cnhArquivo,
    pastaContratoOrigem: item.pastaContrato,
    origemImportacao: "cnh-pasta-contrato",
  };
}

export function defaultDocumentosRaiz(): string {
  const cfg = readLanzaPaths();
  return cfg.documentosRaiz || cfg.contratosDir || defaultContratosDir();
}

export function normNomeKey(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export { formatCpf, nomeDaPasta, parseDataPasta };

const DB_CLIENTES = path.join(REPO_ROOT, "database", "clientes.json");

export type ImportarCnhResult = {
  pastasComCnh: number;
  importados: number;
  atualizados: number;
  ignorados: { pasta: string; motivo: string }[];
};

type DbShape = {
  clientes: ClienteFromCnh[];
  atualizadoEm?: string;
};

function loadDb(): DbShape {
  if (!fs.existsSync(DB_CLIENTES)) return { clientes: [] };
  return JSON.parse(fs.readFileSync(DB_CLIENTES, "utf8")) as DbShape;
}

function deepMergeCliente(a: ClienteFromCnh, b: ClienteFromCnh): ClienteFromCnh {
  const endA = (a.endereco ?? {}) as Record<string, string | null>;
  const endB = (b.endereco ?? {}) as Record<string, string | null>;
  const endMerged: Record<string, string | null> = { ...endA };
  for (const [k, v] of Object.entries(endB)) {
    if (v != null && String(v).trim()) endMerged[k] = v;
  }
  const cnhA = (a.cnh ?? {}) as Record<string, string>;
  const cnhB = (b.cnh ?? {}) as Record<string, string>;
  return {
    ...a,
    ...b,
    id: a.id,
    endereco: endMerged,
    cnh: { ...cnhA, ...cnhB },
  };
}

function mergeCliente(db: DbShape, novo: ClienteFromCnh): "novo" | "atualizado" {
  const cpfKey = novo.cpf ? normCpfKey(String(novo.cpf)) : "";
  const cnhKey = String((novo.cnh as Record<string, string> | undefined)?.numeroRegistro ?? "").replace(
    /\D/g,
    "",
  );

  let idx = -1;
  if (cpfKey) {
    idx = db.clientes.findIndex((c) => c.cpf && normCpfKey(String(c.cpf)) === cpfKey);
  }
  if (idx < 0 && cnhKey) {
    idx = db.clientes.findIndex((c) => {
      const reg = (c.cnh as Record<string, string> | undefined)?.numeroRegistro ?? "";
      return reg.replace(/\D/g, "") === cnhKey;
    });
  }

  if (idx >= 0) {
    const existente = db.clientes[idx]!;
    novo.id = existente.id as string;
    db.clientes[idx] = deepMergeCliente(existente, novo);
    return "atualizado";
  }

  novo.id = crypto.randomUUID();
  db.clientes.push(novo);
  return "novo";
}

async function enrichFromRastreame(cliente: ClienteFromCnh): Promise<void> {
  try {
    const motoristas = await listMotoristas();
    const key = normNomeKey(cliente.nome);
    const match = motoristas.find((m) => {
      const mn = normNomeKey(m.nome ?? "");
      return mn === key || mn.includes(key) || key.includes(mn);
    });
    if (!match) return;
    const mapped = motoristaToCliente(match);
    if (!mapped) return;
    if (!cliente.cpf && mapped.cpf) cliente.cpf = mapped.cpf;
    const cnh = (cliente.cnh ?? {}) as Record<string, string>;
    const mc = (mapped.cnh ?? {}) as Record<string, string>;
    if (!cnh.numeroRegistro && mc.numeroRegistro) cnh.numeroRegistro = mc.numeroRegistro;
    if (!cnh.categoria && mc.categoria) cnh.categoria = mc.categoria;
    if (!cnh.validade && mc.validade) cnh.validade = mc.validade;
    if (Object.keys(cnh).length) cliente.cnh = cnh;
    cliente.rastreameMotoristaKey = mapped.rastreameMotoristaKey;
    cliente.rastreameMotoristaId = mapped.rastreameMotoristaId;
  } catch {
    /* opcional */
  }
}

export async function importarClientesCnh(opts?: {
  raiz?: string;
  dryRun?: boolean;
  comRastreame?: boolean;
}): Promise<ImportarCnhResult> {
  const raiz = opts?.raiz ?? defaultDocumentosRaiz();
  const pastas = listarPastasComCnh([raiz]);
  const result: ImportarCnhResult = {
    pastasComCnh: pastas.length,
    importados: 0,
    atualizados: 0,
    ignorados: [],
  };

  if (pastas.length === 0) return result;

  const db = loadDb();

  for (const item of pastas) {
    const cliente = await montarClienteFromPasta(item);
    if (!cliente) {
      result.ignorados.push({
        pasta: item.pastaNome,
        motivo: "sem CPF (contrato Word ausente ou LOCATÁRIO ilegível)",
      });
      continue;
    }

    if (opts?.comRastreame) await enrichFromRastreame(cliente);

    if (opts?.dryRun) {
      console.log(
        `[dry-run] ${cliente.nome} | CPF ${cliente.cpf} | CNH ${(cliente.cnh as Record<string, string> | undefined)?.numeroRegistro ?? "?"} | ${path.basename(item.cnhArquivo)}`,
      );
      result.importados++;
      continue;
    }

    const acao = mergeCliente(db, cliente);
    if (acao === "novo") {
      result.importados++;
      console.log(`[OK novo] ${cliente.nome} (${cliente.cpf})`);
    } else {
      result.atualizados++;
      console.log(`[OK atualizado] ${cliente.nome} (${cliente.cpf})`);
    }
  }

  if (!opts?.dryRun && (result.importados > 0 || result.atualizados > 0)) {
    db.atualizadoEm = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(DB_CLIENTES, JSON.stringify(db, null, 2), "utf8");
  }

  return result;
}
