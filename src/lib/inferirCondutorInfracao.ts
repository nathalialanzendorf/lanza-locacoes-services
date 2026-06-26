import fs from "node:fs";
import path from "node:path";

import { docxPlainText } from "./docxPlain.js";
import { defaultContratosDir } from "./lanzaPaths.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { REPO_ROOT } from "./repoRoot.js";

const EXCL_PATH =
  /Modelo v3|compra e venda|contrato-compra|Orçamentos|Modelo antigo|\\Copy\\/i;
const EXCL_CLOSED = /devolvido|encerrado|entregue|recolhido/i;

export type CondutorSugerido = {
  condutorId: string | null;
  condutorContrato: string | null;
  clienteNome: string | null;
  aviso: string | null;
};

type Cliente = { id?: string; nome?: string; cpf?: string };

function normNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

function clienteDaPasta(nomePasta: string): string | null {
  const m = nomePasta.match(/^\d{2}\.\d{2}\.\d{2,4}\s*-\s*(.+)$/);
  return m ? m[1]!.trim() : null;
}

/** "DD/MM/AAAA HH:mm" ou "DD/MM/AAAA" */
export function parseDataAutuacao(s: string): Date | null {
  const t = String(s || "").trim();
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const h = m[4] !== undefined ? Number(m[4]) : 12;
  const min = m[5] !== undefined ? Number(m[5]) : 0;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), h, min, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseDataBr(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59, 59);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function extrairPlacaDocx(texto: string): string | null {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "");
  const m = t.match(/placa:\s*([A-Z0-9-]+)/i);
  return m ? formatPlacaHyphen(m[1]!) : null;
}

function extrairCpfDocx(texto: string): string | null {
  const m = texto.match(/CPF sob o n[°º]\s*([\d.\-]+)/i);
  return m ? m[1]!.trim() : null;
}

function extrairPeriodoDocx(
  texto: string,
  inicioPasta: Date,
  prazoDias: number,
): { inicio: Date; fim: Date } {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "");
  const m = t.match(
    /iniciando no dia\s+(\d{2}\/\d{2}\/\d{4})[^e]+e terminando no dia\s+(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (m) {
    const ini = parseDataBr(m[1]!);
    const fim = parseDataBr(m[2]!);
    if (ini && fim) return { inicio: ini, fim };
  }
  const fim = new Date(inicioPasta);
  fim.setDate(fim.getDate() + prazoDias);
  fim.setHours(23, 59, 59, 999);
  return { inicio: inicioPasta, fim };
}

function loadClientes(): Cliente[] {
  const p = path.join(REPO_ROOT, "database", "clientes.json");
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as { clientes?: Cliente[] };
    return j.clientes ?? [];
  } catch {
    return [];
  }
}

function resolveClienteId(
  clientes: Cliente[],
  cpf: string | null,
  nome: string | null,
): string | null {
  if (cpf) {
    const c = clientes.find((x) => x.cpf === cpf);
    if (c?.id) return c.id;
  }
  if (!nome) return null;
  const alvo = normNome(nome);
  for (const c of clientes) {
    if (c.nome && normNome(c.nome) === alvo && c.id) return c.id;
  }
  for (const c of clientes) {
    if (!c.nome || !c.id) continue;
    const n = normNome(c.nome);
    if (n.includes(alvo) || alvo.includes(n)) return c.id;
  }
  return null;
}

type ContratoCand = {
  pastaContrato: string;
  docx: string;
  clienteNome: string;
  inicio: Date;
  fim: Date;
  placa: string;
};

function listarContratosNaData(
  root: string,
  data: Date,
  placaAlvo: string,
  prazoDias: number,
): ContratoCand[] {
  const seen = new Set<string>();
  const out: ContratoCand[] = [];
  const placaNorm = compactPlaca(placaAlvo);

  function walk(dir: string): void {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(p);
        continue;
      }
      if (!ent.isFile() || !/^Contrato.*\.docx$/i.test(ent.name)) continue;
      if (EXCL_PATH.test(p) || EXCL_CLOSED.test(p)) continue;
      const pastaContrato = path.dirname(p);
      if (seen.has(pastaContrato)) continue;
      const nomePasta = path.basename(pastaContrato);
      const inicioPasta = parseDataPasta(nomePasta);
      const cliente = clienteDaPasta(nomePasta);
      if (!inicioPasta || !cliente) continue;

      let texto = "";
      try {
        texto = docxPlainText(p);
      } catch {
        continue;
      }
      const placa = extrairPlacaDocx(texto);
      if (!placa || compactPlaca(placa) !== placaNorm) continue;

      const { inicio, fim } = extrairPeriodoDocx(texto, inicioPasta, prazoDias);
      if (data < inicio || data > fim) continue;

      seen.add(pastaContrato);
      out.push({ pastaContrato, docx: p, clienteNome: cliente, inicio, fim, placa });
    }
  }

  walk(root);
  out.sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
  return out;
}

export function inferirCondutorInfracao(
  placa: string,
  dataAutuacaoStr: string,
  prazoDias = 90,
): CondutorSugerido {
  const data = parseDataAutuacao(dataAutuacaoStr);
  if (!data) {
    return {
      condutorId: null,
      condutorContrato: null,
      clienteNome: null,
      aviso: `Data de autuação inválida: ${dataAutuacaoStr}`,
    };
  }

  const root = defaultContratosDir();
  const candidatos = listarContratosNaData(root, data, placa, prazoDias);
  if (candidatos.length === 0) {
    return {
      condutorId: null,
      condutorContrato: null,
      clienteNome: null,
      aviso: `Nenhum contrato ativo em ${dataAutuacaoStr} para placa ${formatPlacaHyphen(placa)}`,
    };
  }

  const escolhido = candidatos[0]!;
  let texto = "";
  try {
    texto = docxPlainText(escolhido.docx);
  } catch {
    /* use pasta only */
  }
  const cpf = extrairCpfDocx(texto);
  const clientes = loadClientes();
  const condutorId = resolveClienteId(clientes, cpf, escolhido.clienteNome);

  let aviso: string | null = null;
  if (!condutorId) {
    aviso = `Contrato sugere "${escolhido.clienteNome}" mas cliente não encontrado em clientes.json`;
  } else if (candidatos.length > 1) {
    aviso = `${candidatos.length} contratos na data; usado o mais recente: ${escolhido.clienteNome}`;
  }

  return {
    condutorId,
    condutorContrato: escolhido.pastaContrato,
    clienteNome: escolhido.clienteNome,
    aviso,
  };
}
