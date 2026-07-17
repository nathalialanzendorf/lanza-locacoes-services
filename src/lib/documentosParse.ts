/**
 * Leitura de CNH, comprovante de residência e CRLV a partir de PDF (camada de texto).
 */
import path from "node:path";

import pdfParse from "pdf-parse";

import { formatPlacaHyphen } from "./placa.js";

export type DocTipoUpload = "cnh" | "comprovante-residencia" | "crlv";

const ESTADO_UF: Record<string, string> = {
  "Santa Catarina": "SC",
  "São Paulo": "SP",
  "Rio Grande do Sul": "RS",
  "Paraná": "PR",
  "Rio de Janeiro": "RJ",
  "Minas Gerais": "MG",
  "Espírito Santo": "ES",
  "Bahia": "BA",
  "Goiás": "GO",
  "Distrito Federal": "DF",
};

function estadoParaUf(estado: string): string {
  const e = estado.trim();
  if (/^[A-Z]{2}$/.test(e)) return e;
  return ESTADO_UF[e] ?? e;
}

export async function extrairTextoDocumento(
  buffer: Buffer,
  nomeArquivo: string,
): Promise<{ text: string; avisos: string[] }> {
  const ext = path.extname(nomeArquivo).toLowerCase();
  const avisos: string[] = [];

  if (ext === ".pdf") {
    try {
      const data = await pdfParse(buffer);
      const text = (data.text || "").trim();
      if (text.length < 30) {
        avisos.push(
          "PDF com pouco ou nenhum texto — documento escaneado (imagem). Preencha manualmente.",
        );
      }
      return { text, avisos };
    } catch {
      avisos.push("Falha ao ler o PDF.");
      return { text: "", avisos };
    }
  }

  if ([".jpg", ".jpeg", ".png", ".webp", ".jfif"].includes(ext)) {
    avisos.push(
      "Imagens não são lidas automaticamente nesta versão — use PDF com texto ou preencha manualmente.",
    );
    return { text: "", avisos };
  }

  avisos.push(`Formato ${ext || "(sem extensão)"} não suportado — use PDF.`);
  return { text: "", avisos };
}

export type EnderecoParse = {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

export type CnhParseResult = {
  nome?: string;
  cpf?: string;
  cnh?: Record<string, string>;
  rg?: string;
  dataNascimento?: string;
  filiacao?: string;
  nacionalidade?: string;
  avisos: string[];
};

export function parseCnhText(text: string): CnhParseResult {
  const avisos: string[] = [];
  if (!text || text.length < 40) {
    avisos.push("Texto insuficiente para extrair dados da CNH.");
    return { avisos };
  }

  const out: CnhParseResult = { avisos, cnh: {} };
  const flat = text.replace(/\s+/g, " ");

  const cpfM = flat.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
  if (cpfM) out.cpf = cpfM[1];

  const regM = text.match(/(?:REGISTRO|N[°º]\s*REGISTRO|Nº\s*REGISTRO)\s*[:\s]*(\d{11})/i);
  if (regM) out.cnh!.numeroRegistro = regM[1];

  const catM = text.match(/\bCategoria\s*[:\s]*([ABCDE]{1,2})\b/i);
  if (catM) out.cnh!.categoria = catM[1]!.toUpperCase();

  const valM = text.match(/Validade\s*[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
  if (valM) out.cnh!.validade = valM[1];

  const emM = text.match(/(?:Emiss[aã]o|Data de emiss[aã]o)\s*[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
  if (emM) out.cnh!.dataEmissao = emM[1];

  const habM = text.match(/(?:1[aª]\s*Habilita[cç][aã]o|Primeira habilita[cç][aã]o)\s*[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
  if (habM) out.cnh!.primeiraHabilitacao = habM[1];

  const nascM = text.match(
    /(?:Data de nascimento|Nascimento)\s*[:\s]*(\d{2}\/\d{2}\/\d{4})/i,
  );
  if (nascM) out.dataNascimento = nascM[1];

  const rgM = text.match(/(?:DOC\.?\s*IDENTIDADE|IDENTIDADE|RG)\s*[:\s]*([\d.\-/]+(?:\s+[A-Z]{2,10}\s+[A-Z]{2})?)/i);
  if (rgM) out.rg = rgM[1]!.trim();

  const filM = text.match(/Filia[cç][aã]o\s*[:\s]*(.+?)(?:\n|Validade|Categoria|CPF)/is);
  if (filM) out.filiacao = filM[1]!.replace(/\s+/g, " ").trim().slice(0, 120);

  const nomeM = text.match(/(?:NOME(?:\s+COMPLETO)?|Nome)\s*[:\s]*([A-ZÀ-Ú][A-ZÀ-Ú\s'.-]{5,60})/i);
  if (nomeM) {
    out.nome = nomeM[1]!.replace(/\s+/g, " ").trim();
  } else {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const ln of lines.slice(0, 8)) {
      if (/^[A-ZÀ-Ú][A-ZÀ-Ú\s'.-]{8,}$/.test(ln) && !/CNH|DETRAN|BRASIL|MINIST/i.test(ln)) {
        out.nome = ln.replace(/\s+/g, " ").trim();
        break;
      }
    }
  }

  if (!out.cpf && !out.cnh?.numeroRegistro) {
    avisos.push("CPF ou número de registro CNH não encontrados no texto.");
  }

  return out;
}

export type ComprovanteParseResult = {
  titular?: string;
  endereco?: EnderecoParse;
  telefone?: string;
  email?: string;
  avisos: string[];
};

export function parseComprovanteText(text: string): ComprovanteParseResult {
  const avisos: string[] = [];
  if (!text || text.length < 20) {
    avisos.push("Texto insuficiente para extrair endereço.");
    return { avisos };
  }

  const out: ComprovanteParseResult = { avisos, endereco: {} };
  const flat = text.replace(/\s+/g, " ");

  const cepM = flat.match(/\b(\d{5}-?\d{3})\b/);
  if (cepM) {
    const d = cepM[1]!.replace(/\D/g, "");
    out.endereco!.cep = `${d.slice(0, 5)}-${d.slice(5)}`;
  } else {
    avisos.push("CEP não encontrado.");
  }

  const titM = flat.match(
    /(?:Cliente|Titular|Nome(?:\s+do\s+cliente)?)\s*[:\s]+([A-Za-zÀ-ú][A-Za-zÀ-ú\s'.-]{4,60})/i,
  );
  if (titM) out.titular = titM[1]!.trim();

  const telM = flat.match(/(?:Tel(?:efone)?|Celular|Fone)\s*[:\s]*([\d()\s\-+]{10,18})/i);
  if (telM) out.telefone = telM[1]!.replace(/\s+/g, " ").trim();

  const emailM = flat.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  if (emailM) out.email = emailM[0]!.toLowerCase();

  const logM = flat.match(
    /((?:RUA|R\.|AV\.?|AVENIDA|TRAVESSA|ALAMEDA|RODOVIA|ESTRADA)[^,\n]{3,80})/i,
  );
  if (logM) out.endereco!.logradouro = logM[1]!.replace(/\s+/g, " ").trim();

  const numM = flat.match(/(?:N[°º]|Nº|Numero|Número)\s*[:\s]*(\d+|S\/N)/i);
  if (numM) out.endereco!.numero = numM[1]!.toUpperCase();

  const bairroM = flat.match(/(?:Bairro|BAIRRO)\s*[:\s]*([A-Za-zÀ-ú0-9\s'.-]{2,40})/i);
  if (bairroM) out.endereco!.bairro = bairroM[1]!.trim();

  const cidM = flat.match(
    /(?:Cidade|Municipio|Município|Localidade)\s*[:\s]*([A-Za-zÀ-ú\s'.-]{2,40})/i,
  );
  if (cidM) out.endereco!.cidade = cidM[1]!.trim();

  const ufM = flat.match(/(?:UF|Estado)\s*[:\s]*([A-Z]{2}|Santa Catarina|São Paulo|Rio Grande do Sul)/i);
  if (ufM) out.endereco!.uf = estadoParaUf(ufM[1]!);

  if (!out.endereco!.logradouro && cepM) {
    const idx = flat.indexOf(cepM[0]!);
    const trecho = flat.slice(Math.max(0, idx - 120), idx);
    const partes = trecho.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    if (partes.length) {
      out.endereco!.logradouro = partes[partes.length - 1];
    }
  }

  if (!out.endereco!.logradouro && !out.endereco!.cep) {
    avisos.push("Endereço não identificado — confira o titular e preencha manualmente.");
  }

  return out;
}

function lineBlocks(text: string): string[] {
  return text.replace(/\r/g, "\n").split("\n").map((ln) => ln.trim());
}

function nextMeaningful(lines: string[], start: number): string | null {
  const skip = new Set(["", "-", ".", "..."]);
  for (let j = start; j < Math.min(start + 8, lines.length); j++) {
    const s = lines[j]?.trim() || "";
    if (s && !skip.has(s)) return s;
  }
  return null;
}

function findLineValue(lines: string[], ...labels: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const u = lines[i]!.toUpperCase();
    for (const lab of labels) {
      if (u.includes(lab.toUpperCase()) && lines[i]!.length < 80) {
        const v = nextMeaningful(lines, i + 1);
        if (v) return v;
      }
    }
  }
  return null;
}

export type CrlvParseResult = {
  placa?: string;
  marcaModelo?: string;
  anoModelo?: string;
  chassi?: string;
  renavam?: string;
  cor?: string;
  ufRegistro?: string;
  proprietarioNome?: string;
  avisos: string[];
};

export function parseCrlvText(text: string): CrlvParseResult {
  const avisos: string[] = [];
  if (!text || text.length < 40) {
    avisos.push("Texto insuficiente para extrair dados do CRLV.");
    return { avisos };
  }

  const out: CrlvParseResult = { avisos };
  const lines = lineBlocks(text);
  const raw = lines.join("\n");

  let m = raw.match(/CHASSI\s*[:\s]*([A-HJ-NPR-Z0-9]{17})/i);
  if (!m) m = raw.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  if (m && m[1]!.length === 17) out.chassi = m[1]!.toUpperCase();

  m = raw.match(/RENAVAM\s*[:\s]*(\d{10,11})\b/i);
  if (m) out.renavam = m[1]!;

  m = raw.match(/PLACA\s*[:\s]*([A-Z]{3}[\dA-Z][A-Z0-9]{4}|[A-Z]{3}\d{4})\b/i);
  if (m) out.placa = formatPlacaHyphen(m[1]!);

  let mm = findLineValue(lines, "MARCA / MODELO", "MARCA/MODELO", "MARCA E MODELO", "MARCAMODELO");
  if (mm) {
    mm = mm.replace(/\s+/g, " ").trim();
    if (mm.includes("/") || /[A-Z]{2,}/i.test(mm)) {
      out.marcaModelo = /^[\x00-\x7f]+$/.test(mm) ? mm.toUpperCase() : mm;
    }
  }

  const am = findLineValue(lines, "ANO MODELO", "ANO/MODELO", "ANO DO MODELO");
  if (am) {
    const amClean = am.replace(/\s+/g, "");
    let m2 = amClean.match(/(\d{4})\/(\d{4})/);
    if (!m2) m2 = am.match(/(\d{4})\s*\/\s*(\d{4})/);
    if (m2) out.anoModelo = `${m2[1]}/${m2[2]}`;
  }

  let cor = findLineValue(lines, "COR PREDOMINANTE", "COR", "COR DO VEÍCULO", "COR DO VEICULO");
  if (cor) {
    cor = cor.replace(/\s+/g, " ").trim();
    if (cor.length < 40 && !/^\d+$/.test(cor)) out.cor = cor.toUpperCase();
  }

  const ufM = findLineValue(lines, "UF", "UF DE REGISTRO", "LOCAL DE REGISTRO");
  if (ufM && /^[A-Z]{2}$/.test(ufM.trim())) out.ufRegistro = ufM.trim();

  let prop = findLineValue(
    lines,
    "NOME DO PROPRIETÁRIO",
    "NOME DO PROPRIETARIO",
    "PROPRIETÁRIO",
    "PROPRIETARIO",
    "NOME PROPRIETÁRIO",
  );
  if (!prop) {
    const pm = raw.match(
      /(?:PROPRIET[AÁ]RIO|NOME DO PROPRIET[AÁ]RIO)\s*[:\s]*([A-ZÀ-Ú][A-ZÀ-Ú\s'.-]{4,60})/i,
    );
    if (pm) prop = pm[1]!;
  }
  if (prop) out.proprietarioNome = prop.replace(/\s+/g, " ").trim();

  if (!out.marcaModelo) {
    m = raw.match(/([A-Z]{2,15})\s*\/\s*([A-Z0-9][A-Z0-9\s.\-]{2,40})/i);
    if (m && m[0]!.length < 60) {
      out.marcaModelo = `${m[1]!.toUpperCase()}/${m[2]!.toUpperCase().trim()}`;
    }
  }

  if (!out.placa && !out.chassi) {
    avisos.push("Placa ou chassi não encontrados no CRLV.");
  }

  return out;
}

export async function lerDocumentoUpload(input: {
  tipo: DocTipoUpload;
  nomeArquivo: string;
  conteudoBase64: string;
}): Promise<{
  tipo: DocTipoUpload;
  campos: CnhParseResult | ComprovanteParseResult | CrlvParseResult;
  avisos: string[];
  textoChars: number;
}> {
  const buf = Buffer.from(input.conteudoBase64, "base64");
  const { text, avisos: extAvisos } = await extrairTextoDocumento(buf, input.nomeArquivo);
  const avisos = [...extAvisos];

  switch (input.tipo) {
    case "cnh": {
      const campos = parseCnhText(text);
      return { tipo: input.tipo, campos, avisos: [...avisos, ...campos.avisos], textoChars: text.length };
    }
    case "comprovante-residencia": {
      const campos = parseComprovanteText(text);
      return { tipo: input.tipo, campos, avisos: [...avisos, ...campos.avisos], textoChars: text.length };
    }
    case "crlv": {
      const campos = parseCrlvText(text);
      return { tipo: input.tipo, campos, avisos: [...avisos, ...campos.avisos], textoChars: text.length };
    }
    default:
      throw new Error(`Tipo de documento inválido: ${input.tipo}`);
  }
}
