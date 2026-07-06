/**
 * API /keek/rest/motorista — listagem e cadastro de motorista.
 */
import fs from "node:fs";

import { RASTREAME_ORIGIN, rastreameJsonHeaders } from "./auth.js";
import { fetchRastreameWith401Retry } from "./fetchRetry.js";

const MOTORISTA_BASE = `${RASTREAME_ORIGIN}/keek/rest/motorista`;

function digits(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

export type MotoristaRastreame = {
  id?: string | number;
  key?: string | number;
  nome?: string;
  cnh?: string;
  cpf?: string | null;
  observacao?: string;
  categoriaCnh?: { key?: string; value?: string } | null;
  vencimentoCnh?: string;
  contato?: { fixo?: string | null; celular?: string | null; email?: string | null } | null;
  ativo?: boolean;
};

/** @deprecated use MotoristaRastreame */
export type Motorista = MotoristaRastreame;

async function fetchMotoristaList(url: string): Promise<MotoristaRastreame[]> {
  const r = await fetchRastreameWith401Retry(url, {
    headers: await rastreameJsonHeaders(false),
  });
  const raw = await r.text();
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ao listar motoristas: ${raw.slice(0, 200)}`);
  }
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    throw new Error(`Resposta inválida ao listar motoristas: ${raw.slice(0, 200)}`);
  }
  if (d && typeof d === "object" && "message" in d && !("content" in d)) {
    throw new Error(`Rastreame: ${String((d as { message?: string }).message)}`);
  }
  if (Array.isArray(d)) return d as MotoristaRastreame[];
  const page = d as { content?: MotoristaRastreame[] };
  return page.content ?? [];
}

export async function listMotoristas(): Promise<MotoristaRastreame[]> {
  const urls = [
    `${MOTORISTA_BASE}?ativo=true&size=2000`,
    `${MOTORISTA_BASE}/?ativo=true&size=2000`,
    `${MOTORISTA_BASE}`,
    `${MOTORISTA_BASE}/`,
  ];
  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const list = await fetchMotoristaList(url);
      if (list.length > 0) return list;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (lastErr.message.includes("Autenticação")) throw lastErr;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

export async function findMotorista(
  cnh: string,
  nome: string,
): Promise<Motorista | null> {
  const cnhD = digits(cnh);
  const nomeN = nome.trim().toLowerCase();
  for (const m of await listMotoristas()) {
    if (cnhD && digits(String(m.cnh ?? "")) === cnhD) return m;
    if (nomeN && (m.nome ?? "").trim().toLowerCase() === nomeN) return m;
  }
  return null;
}

function br2iso(d: string | undefined): string | null {
  const m = (d || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

type Cliente = Record<string, unknown>;

/** Contato nativo do Rastreame a partir dos campos da database. */
function buildContato(
  c: Cliente,
): { fixo: null; celular: string | null; email: string | null } | undefined {
  const celular = digits(c.telefone as string) || null;
  const email = (c.email as string | undefined) ?? null;
  if (!celular && !email) return undefined;
  return { fixo: null, celular, email };
}

function trimOrNull(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t || null;
}

/** "Porto Alegre/RS" → "Porto Alegre, RS"; "Laguna SC" → "Laguna, SC". */
function formatLocalNascimento(local: string): string {
  const t = local.trim();
  if (t.includes("/")) return t.replace(/\//g, ", ");
  const m = t.match(/^(.+?)\s+([A-Za-z]{2})$/);
  return m ? `${m[1]}, ${m[2]!.toUpperCase()}` : t;
}

function formatRgOrgao(org: string): string {
  return org.trim().replace(/\//g, " ");
}

/** "Pai e Mãe" → "Pai / Mãe" (formato espelhado no Rastreame). */
function formatFiliacao(filiacao: string): string {
  return filiacao.trim().replace(/\s+\be\b\s+/gi, " / ");
}

const OBS_SEP = "------------------------------------------------------------";

/** Limite do campo `observacao` no Rastreame (API rejeita acima disso). */
export const OBSERVACAO_RASTREAME_MAX = 500;

/** Corta lixo de contrato colado por engano em campos de endereço. */
const ENDERECO_LIXO = /\.\s*As partes acima|Cláusula\s+\d|LOCATÁRIO|LOCADOR|valor de R\$/i;

const UF_NOME: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

function nomeEstado(end: Record<string, unknown>): string | null {
  const estado = trimOrNull(end.estado);
  if (estado) return estado;
  const uf = trimOrNull(end.uf)?.toUpperCase();
  if (!uf) return null;
  return UF_NOME[uf] ?? uf;
}

function sanitizeEnderecoCampo(v: unknown, max = 100): string | null {
  let t = trimOrNull(v);
  if (!t) return null;
  if (ENDERECO_LIXO.test(t)) {
    const corte = t.search(ENDERECO_LIXO);
    t = (corte > 0 ? t.slice(0, corte) : "").trim();
  }
  if (!t || ENDERECO_LIXO.test(t)) return null;
  if (t.length > max) t = `${t.slice(0, max).trim()}…`;
  return t || null;
}

/** Ex.: Rua Manoel Cruz, S/N, Centro, Jaguaruna, Santa Catarina, 88715-000. */
function formatEnderecoObservacao(end: Record<string, unknown> | null | undefined): string | null {
  if (!end || typeof end !== "object") return null;
  const log = sanitizeEnderecoCampo(end.logradouro, 120);
  const numRaw = sanitizeEnderecoCampo(end.numero, 30);
  const num = numRaw ?? "S/N";
  const comp = sanitizeEnderecoCampo(end.complemento, 40);
  const bairro = sanitizeEnderecoCampo(end.bairro, 60);
  const cidade = sanitizeEnderecoCampo(end.cidade, 60);
  const estadoRaw = nomeEstado(end);
  const estado =
    estadoRaw && estadoRaw.length > 40 ? `${estadoRaw.slice(0, 40).trim()}…` : estadoRaw;
  const cep = sanitizeEnderecoCampo(end.cep, 12);
  const parts = [log, num, comp, bairro, cidade, estado, cep].filter(Boolean);
  if (parts.length === 0) return null;
  let line = `${parts.join(", ")}.`;
  if (line.length > 200) line = `${line.slice(0, 197).trim()}…`;
  return line;
}

function buildSecaoCnh(c: Cliente, opts?: { extras?: boolean }): string[] {
  const incluirExtras = opts?.extras !== false;
  const cnh = (c.cnh ?? {}) as Record<string, unknown>;
  const lines: string[] = [];

  const nasc = trimOrNull(c.dataNascimento);
  const local = trimOrNull(c.localNascimento);
  if (nasc && local) lines.push(`${nasc}, ${formatLocalNascimento(local)}`);
  else if (nasc) lines.push(nasc);
  else if (local) lines.push(formatLocalNascimento(local));

  const emissao = trimOrNull(cnh.dataEmissao);
  if (emissao) lines.push(emissao);

  const rg = trimOrNull(c.rg);
  const org = trimOrNull(c.rgOrgaoExpedidor);
  if (rg || org) lines.push([rg, org ? formatRgOrgao(org) : null].filter(Boolean).join(" "));

  const cpf = trimOrNull(c.cpf);
  if (cpf) lines.push(cpf);

  lines.push(trimOrNull(c.nacionalidade) ?? "Brasileiro(a)");

  const fil = trimOrNull(c.filiacao);
  if (fil) lines.push(formatFiliacao(fil));

  if (!incluirExtras) return lines;

  const primeira = trimOrNull(cnh.primeiraHabilitacao);
  if (primeira && primeira !== emissao) lines.push(`1ª habilitação: ${primeira}`);

  const espelho = trimOrNull(cnh.numeroEspelho);
  if (espelho) lines.push(`Espelho: ${espelho}`);

  const emissor = trimOrNull(cnh.orgaoEmissor);
  const ufEm = trimOrNull(cnh.ufEmissor);
  if (emissor || ufEm) lines.push(`Emissor: ${[emissor, ufEm].filter(Boolean).join("/")}`);

  if (cnh.ear === true || cnh.ear === "true") lines.push("EAR: Sim");
  else if (cnh.ear === false || cnh.ear === "false") lines.push("EAR: Não");

  const obsCnh = trimOrNull(cnh.observacoes);
  if (obsCnh) lines.push(`Obs CNH: ${obsCnh}`);

  return lines;
}

function montarObservacao(cnhLines: string[], endereco: string | null): string | null {
  const blocks: string[] = [];
  if (cnhLines.length > 0) blocks.push(OBS_SEP, "CNH", OBS_SEP, ...cnhLines);
  if (endereco) blocks.push(OBS_SEP, "ENDEREÇO", OBS_SEP, endereco);
  if (blocks.length === 0) return null;
  return blocks.join("\n");
}

function limitarObservacao(texto: string): string {
  if (texto.length <= OBSERVACAO_RASTREAME_MAX) return texto;
  return `${texto.slice(0, OBSERVACAO_RASTREAME_MAX - 1)}…`;
}

/**
 * Monta o texto de `observacao` no Rastreame com dados da CNH e endereço
 * (campos sem equivalente nativo no site). Respeita {@link OBSERVACAO_RASTREAME_MAX}.
 *
 * Formato:
 *   ------------------------------------------------------------
 *   CNH
 *   ------------------------------------------------------------
 *   (nascimento, emissão, RG, CPF, nacionalidade, filiação, …)
 *   ------------------------------------------------------------
 *   ENDEREÇO
 *   ------------------------------------------------------------
 *   Logradouro, Nº, Bairro, Cidade, Estado, CEP.
 */
export function buildMotoristaObservacao(c: Cliente): string | null {
  const endereco = formatEnderecoObservacao(c.endereco as Record<string, unknown> | undefined);
  const cnhFull = buildSecaoCnh(c, { extras: true });
  const cnhBase = buildSecaoCnh(c, { extras: false });

  const variantes = [
    montarObservacao(cnhFull, endereco),
    montarObservacao(cnhBase, endereco),
  ].filter((v): v is string => v != null);

  for (const v of variantes) {
    if (v.length <= OBSERVACAO_RASTREAME_MAX) return v;
  }

  // Prioriza ENDEREÇO: reduz linhas da CNH até caber (nunca descarta endereço por limite).
  if (endereco) {
    for (let n = cnhBase.length; n >= 0; n--) {
      const v = montarObservacao(cnhBase.slice(0, n), endereco);
      if (v && v.length <= OBSERVACAO_RASTREAME_MAX) return v;
    }
    const soEndereco = montarObservacao([], endereco);
    if (soEndereco && soEndereco.length <= OBSERVACAO_RASTREAME_MAX) return soEndereco;
  }

  const soCnh = montarObservacao(cnhBase, null);
  if (soCnh && soCnh.length <= OBSERVACAO_RASTREAME_MAX) return soCnh;
  return soCnh ? limitarObservacao(soCnh) : null;
}

/**
 * Payload do motorista no Rastreame — campos nativos + `observacao` com dados
 * extras da CNH. Campos nulos/ausentes são omitidos no payload nativo para não
 * sobrescrever valores existentes no Rastreame durante o PUT.
 */
export function buildMotoristaPayload(c: Cliente): Record<string, unknown> {
  const cnh = (c.cnh ?? {}) as Record<string, string>;
  const payload: Record<string, unknown> = {
    nome: c.nome,
    ativo: c.ativo !== false,
  };
  if (cnh.numeroRegistro) payload.cnh = digits(cnh.numeroRegistro);
  if (c.cpf) payload.cpf = digits(c.cpf as string);
  if (cnh.categoria) payload.categoriaCnh = { key: cnh.categoria };
  const venc = br2iso(cnh.validade);
  if (venc) payload.vencimentoCnh = venc;
  const contato = buildContato(c);
  if (contato) payload.contato = contato;
  const observacao = buildMotoristaObservacao(c);
  if (observacao) payload.observacao = observacao;
  return payload;
}

export async function fetchAllMotoristas(size = 100): Promise<MotoristaRastreame[]> {
  const all: MotoristaRastreame[] = [];
  const seen = new Set<string>();
  let page = 0;
  for (;;) {
    const q = new URLSearchParams({ page: String(page), size: String(size) });
    const r = await fetchRastreameWith401Retry(`${MOTORISTA_BASE}?${q.toString()}`, {
      headers: await rastreameJsonHeaders(false),
    });
    const chunk = await fetchMotoristaListFromResponse(r);
    for (const m of chunk) {
      const k = refKeyMotorista(m);
      if (k && !seen.has(k)) {
        seen.add(k);
        all.push(m);
      }
    }
    if (chunk.length < size) break;
    page++;
    if (page > 500) break;
  }
  return all;
}

/**
 * Lista todos os motoristas e busca o DETALHE de cada um.
 * A listagem (`fetchAllMotoristas`) só traz campos de resumo (id, nome, celular,
 * ativo); CNH, CPF, observação e contato completo só vêm no GET por id.
 */
export async function fetchAllMotoristasDetailed(): Promise<MotoristaRastreame[]> {
  const lista = await fetchAllMotoristas();
  const out: MotoristaRastreame[] = [];
  for (const item of lista) {
    const key = refKeyMotorista(item);
    if (!key) continue;
    try {
      out.push(await fetchMotoristaByKey(key));
    } catch {
      out.push(item);
    }
  }
  return out;
}

async function fetchMotoristaListFromResponse(r: Response): Promise<MotoristaRastreame[]> {
  const raw = await r.text();
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ao listar motoristas: ${raw.slice(0, 200)}`);
  }
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    throw new Error(`Resposta inválida ao listar motoristas: ${raw.slice(0, 200)}`);
  }
  if (d && typeof d === "object" && "message" in d && !("content" in d)) {
    throw new Error(`Rastreame: ${String((d as { message?: string }).message)}`);
  }
  if (Array.isArray(d)) return d as MotoristaRastreame[];
  const page = d as { content?: MotoristaRastreame[] };
  return page.content ?? [];
}

function refKeyMotorista(m: MotoristaRastreame): string {
  return String(m.key ?? m.id ?? "");
}

export async function fetchMotoristaByKey(key: string | number): Promise<MotoristaRastreame> {
  const r = await fetchRastreameWith401Retry(`${MOTORISTA_BASE}/${key}`, {
    headers: await rastreameJsonHeaders(false),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`motorista GET ${key} HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as MotoristaRastreame;
}

export async function postMotoristaPayload(body: unknown): Promise<MotoristaRastreame> {
  const r = await fetchRastreameWith401Retry(`${MOTORISTA_BASE}/`, {
    method: "POST",
    headers: await rastreameJsonHeaders(true),
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`motorista POST HTTP ${r.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as MotoristaRastreame;
}

export async function putMotorista(key: string | number, body: unknown): Promise<void> {
  const r = await fetchRastreameWith401Retry(`${MOTORISTA_BASE}/${key}`, {
    method: "PUT",
    headers: await rastreameJsonHeaders(true),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`motorista PUT ${key} HTTP ${r.status}: ${t.slice(0, 300)}`);
  }
}

/** Reativa motorista inativo no Rastreame (POST sem corpo). */
export async function ativarMotorista(key: string | number): Promise<void> {
  const r = await fetchRastreameWith401Retry(`${MOTORISTA_BASE}/${key}`, {
    method: "POST",
    headers: await rastreameJsonHeaders(true),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`motorista POST (ativar) ${key} HTTP ${r.status}: ${t.slice(0, 300)}`);
  }
}

/** Inativa motorista no Rastreame (DELETE). */
export async function inativarMotorista(key: string | number): Promise<void> {
  const r = await fetchRastreameWith401Retry(`${MOTORISTA_BASE}/${key}`, {
    method: "DELETE",
    headers: await rastreameJsonHeaders(true),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`motorista DELETE (inativar) ${key} HTTP ${r.status}: ${t.slice(0, 300)}`);
  }
}

/** Vincula motorista a rastreável (POST /motorista/{motoristaKey}/{rastreavelKey}/). */
export async function vincularMotoristaRastreavel(
  motoristaKey: string | number,
  rastreavelKey: string | number,
): Promise<void> {
  const r = await fetchRastreameWith401Retry(
    `${MOTORISTA_BASE}/${motoristaKey}/${rastreavelKey}/`,
    {
      method: "POST",
      headers: await rastreameJsonHeaders(true),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(
      `motorista/rastreavel POST ${motoristaKey}/${rastreavelKey} HTTP ${r.status}: ${t.slice(0, 300)}`,
    );
  }
}

/** Remove vínculo motorista ↔ rastreável (DELETE ?force=true). */
export async function desvincularMotoristaRastreavel(
  motoristaKey: string | number,
  rastreavelKey: string | number,
): Promise<void> {
  const r = await fetchRastreameWith401Retry(
    `${MOTORISTA_BASE}/${motoristaKey}/${rastreavelKey}?force=true`,
    {
      method: "DELETE",
      headers: await rastreameJsonHeaders(true),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(
      `motorista/rastreavel DELETE ${motoristaKey}/${rastreavelKey} HTTP ${r.status}: ${t.slice(0, 300)}`,
    );
  }
}

export async function postMotorista(clienteJsonPath: string): Promise<void> {
  const c = JSON.parse(
    fs.readFileSync(clienteJsonPath, "utf8"),
  ) as Cliente;
  const cnh = (c.cnh ?? {}) as Record<string, string>;
  const payload = buildMotoristaPayload(c);
  const ja = await findMotorista(cnh.numeroRegistro ?? "", String(c.nome ?? ""));
  if (ja) {
    const key = String(ja.key ?? ja.id ?? "");
    if (key) {
      const atual = await fetchMotoristaByKey(key);
      await putMotorista(key, { ...atual, ...payload, ativo: true });
      console.log(`ATUALIZADO no rastreame: ${ja.nome} (key ${key})`);
    } else {
      console.log(`JA CADASTRADO no rastreame: ${ja.nome} (id ${ja.id}) — sem key para atualizar.`);
    }
    return;
  }
  const created = await postMotoristaPayload(payload);
  console.log(`CADASTRADO no rastreame: ${payload.nome} (key ${created.key ?? created.id})`);
}
