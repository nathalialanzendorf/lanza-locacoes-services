/**
 * Leitura de CNH, comprovante de residência e CRLV (texto PDF + OCR em imagem).
 */
import path from "node:path";

import pdfParse from "pdf-parse";

import { escolherMaiorImagemEmbutida, extrairJpegsEmbutidosPdf } from "./cnhPdfImagem.js";
import { ocrDocumentoImagem } from "./documentoOcr.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";

export type DocTipoUpload = "cnh" | "comprovante-residencia" | "crlv";

const ESTADO_UF: Record<string, string> = {
  Acre: "AC",
  Alagoas: "AL",
  Amapá: "AP",
  Amazonas: "AM",
  Bahia: "BA",
  Ceará: "CE",
  "Distrito Federal": "DF",
  "Espírito Santo": "ES",
  Goiás: "GO",
  Maranhão: "MA",
  "Mato Grosso": "MT",
  "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG",
  Pará: "PA",
  Paraíba: "PB",
  Paraná: "PR",
  Pernambuco: "PE",
  Piauí: "PI",
  "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS",
  Rondônia: "RO",
  Roraima: "RR",
  "Santa Catarina": "SC",
  "São Paulo": "SP",
  Sergipe: "SE",
  Tocantins: "TO",
};

const UF_SIGLAS = new Set(Object.values(ESTADO_UF));

function estadoParaUf(estado: string): string {
  const e = estado.trim();
  if (/^[A-Z]{2}$/.test(e)) return e;
  return ESTADO_UF[e] ?? e;
}

function cpfDigits(cpf: string): string {
  return String(cpf ?? "").replace(/\D/g, "");
}

function cpfValido(cpf: string): boolean {
  const d = cpfDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const dv1 = calc(d.slice(0, 9), 10);
  const dv2 = calc(d.slice(0, 10), 11);
  return dv1 === Number(d[9]) && dv2 === Number(d[10]);
}

function cpfFormatado(cpf: string): string {
  const d = cpfDigits(cpf);
  return d.length === 11
    ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    : cpf;
}

/** Junta dígitos separados por espaço/quebra (comum em PDFs de CNH-e), sem colar após hífen/ponto. */
function compactarDigitosEspacados(text: string): string {
  return text.replace(/(?<![.\-/])(\d)\s+(?=\d)/g, "$1");
}

function extrairOnzeDigitos(text: string): string[] {
  const compact = compactarDigitosEspacados(text);
  const found = compact.match(/\b(\d{11})\b/g) ?? [];
  return [...new Set(found)];
}

function extrairDigitosRotulo(text: string, rotulo: RegExp): string | null {
  const m = text.match(rotulo);
  if (!m?.[1]) return null;
  const d = cpfDigits(m[1]);
  return d.length === 11 ? d : null;
}

function isImagemExt(ext: string): boolean {
  return [".jpg", ".jpeg", ".png", ".webp", ".jfif"].includes(ext);
}

function cnhParseOk(parsed: CnhParseResult): boolean {
  return Boolean(parsed.cpf || parsed.cnh?.numeroRegistro);
}

function comprovanteParseOk(parsed: ComprovanteParseResult): boolean {
  const e = parsed.endereco ?? {};
  if (!e.cep && !e.logradouro) return false;
  return Boolean(e.cidade && e.bairro && e.uf);
}

async function textoPdf(buffer: Buffer, avisoOcr: string): Promise<{ text: string; avisos: string[] }> {
  const avisos: string[] = [];
  try {
    const data = await pdfParse(buffer);
    const text = (data.text || "").trim();
    if (text.length < 30) {
      avisos.push(avisoOcr);
    }
    return { text, avisos };
  } catch {
    avisos.push("Falha ao ler o PDF.");
    return { text: "", avisos };
  }
}

type ExtrairOcrOpts = {
  docLabel: string;
  avisoPoucoTexto: string;
  avisoOcrOk: string;
  avisoSemImagem: string;
  parseOk: (text: string) => boolean;
};

async function extrairTextoComOcr(
  buffer: Buffer,
  nomeArquivo: string,
  opts: ExtrairOcrOpts,
): Promise<{ text: string; avisos: string[]; viaOcr: boolean }> {
  const ext = path.extname(nomeArquivo).toLowerCase();
  const avisos: string[] = [];

  async function ocr(bufferImagem: Buffer, msg: string): Promise<{ text: string; viaOcr: boolean }> {
    try {
      const text = await ocrDocumentoImagem(bufferImagem);
      avisos.push(msg);
      return { text, viaOcr: true };
    } catch {
      avisos.push(`Falha no OCR do ${opts.docLabel} — preencha manualmente.`);
      return { text: "", viaOcr: true };
    }
  }

  if (isImagemExt(ext)) {
    const r = await ocr(buffer, `Dados lidos por OCR a partir da imagem do ${opts.docLabel}.`);
    return { text: r.text, avisos, viaOcr: r.viaOcr };
  }

  if (ext !== ".pdf") {
    avisos.push(`Formato ${ext || "(sem extensão)"} não suportado — use PDF ou imagem.`);
    return { text: "", avisos, viaOcr: false };
  }

  const pdf = await textoPdf(buffer, opts.avisoPoucoTexto);
  avisos.push(...pdf.avisos);
  if (pdf.text && opts.parseOk(pdf.text)) {
    return { text: pdf.text, avisos, viaOcr: false };
  }

  const jpegs = extrairJpegsEmbutidosPdf(buffer);
  const imagem = escolherMaiorImagemEmbutida(jpegs);
  if (!imagem) {
    avisos.push(opts.avisoSemImagem);
    return { text: pdf.text, avisos, viaOcr: false };
  }

  const r = await ocr(imagem, opts.avisoOcrOk);
  return { text: r.text || pdf.text, avisos, viaOcr: r.viaOcr };
}

export async function extrairTextoCnh(
  buffer: Buffer,
  nomeArquivo: string,
): Promise<{ text: string; avisos: string[]; viaOcr: boolean }> {
  return extrairTextoComOcr(buffer, nomeArquivo, {
    docLabel: "CNH",
    avisoPoucoTexto: "PDF com pouco texto — tentando OCR na imagem da CNH.",
    avisoOcrOk: "Dados lidos por OCR a partir da imagem embutida na CNH-e.",
    avisoSemImagem:
      "Nenhuma imagem encontrada no PDF (pode ser JBIG2/PNG). Envie foto da CNH ou preencha manualmente.",
    parseOk: (text) => cnhParseOk(parseCnhText(text)),
  });
}

export async function extrairTextoComprovante(
  buffer: Buffer,
  nomeArquivo: string,
): Promise<{ text: string; avisos: string[]; viaOcr: boolean }> {
  return extrairTextoComOcr(buffer, nomeArquivo, {
    docLabel: "comprovante de residência",
    avisoPoucoTexto: "PDF com pouco texto — tentando OCR na imagem do comprovante.",
    avisoOcrOk: "Dados lidos por OCR a partir da imagem do comprovante.",
    avisoSemImagem:
      "Nenhuma imagem encontrada no PDF. Envie foto do comprovante ou preencha manualmente.",
    parseOk: (text) => comprovanteParseOk(parseComprovanteText(text)),
  });
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
  const seqs = extrairOnzeDigitos(text ?? "");
  if (!text?.trim() || (text.trim().length < 40 && seqs.length === 0)) {
    avisos.push("Texto insuficiente para extrair dados da CNH.");
    return { avisos };
  }

  const out: CnhParseResult = { avisos, cnh: {} };
  const flat = text.replace(/\s+/g, " ");
  const digitsFlat = compactarDigitosEspacados(flat);

  const cpfFormatadoM = flat.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
  if (cpfFormatadoM) out.cpf = cpfFormatadoM[1];

  if (!out.cpf) {
    const cpfRotulo =
      extrairDigitosRotulo(text, /\bCPF\b[^0-9]{0,25}([\d.\-\s]{11,22})/i) ??
      extrairDigitosRotulo(flat, /\bCPF\b[^0-9]{0,25}([\d.\-\s]{11,22})/i);
    if (cpfRotulo) out.cpf = cpfFormatado(cpfRotulo);
  }

  if (!out.cpf) {
    for (const seq of extrairOnzeDigitos(text)) {
      if (cpfValido(seq)) {
        out.cpf = cpfFormatado(seq);
        break;
      }
    }
  }

  const regRotulo =
    extrairDigitosRotulo(
      text,
      /(?:N[°º.]?\s*REG(?:ISTRO)?\.?|REGISTRO(?:\s*\/\s*CNH)?)\s*[:\/\s]*([\d\s]{11,22})/i,
    ) ??
    extrairDigitosRotulo(text, /4\s*[bB][^\d]{0,25}([\d\s]{11,22})/);
  if (regRotulo) out.cnh!.numeroRegistro = regRotulo;

  if (!out.cnh?.numeroRegistro) {
    const regM = digitsFlat.match(
      /(?:REGISTRO|N[°º]\s*REGISTRO|Nº\s*REGISTRO)\s*[:\s]*(\d{11})/i,
    );
    if (regM) out.cnh!.numeroRegistro = regM[1];
  }

  if (!out.cnh?.numeroRegistro) {
    const cpfDig = out.cpf ? cpfDigits(out.cpf) : null;
    for (const seq of extrairOnzeDigitos(text)) {
      if (seq !== cpfDig) {
        out.cnh!.numeroRegistro = seq;
        break;
      }
    }
  }

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
    const seqs = extrairOnzeDigitos(text);
    if (seqs.length === 0) {
      avisos.push(
        "CPF e registro não encontrados — a CNH-e costuma ser PDF só com imagem (sem texto). Preencha manualmente ou use exportação com campos legíveis.",
      );
    } else {
      avisos.push("CPF ou número de registro CNH não encontrados no texto.");
    }
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
  if (!text?.trim() || text.trim().length < 15) {
    avisos.push("Texto insuficiente para extrair endereço.");
    return { avisos };
  }

  const out: ComprovanteParseResult = { avisos, endereco: {} };
  const flat = text.replace(/\s+/g, " ");
  const lines = lineBlocks(text);

  const cepM = flat.match(/\b(\d{5}-?\d{3})\b/);
  if (cepM) {
    const d = cepM[1]!.replace(/\D/g, "");
    out.endereco!.cep = `${d.slice(0, 5)}-${d.slice(5)}`;
  } else {
    avisos.push("CEP não encontrado.");
  }

  const titLinha = lines.find((l) =>
    /^(?:Cliente|Titular|Sacado|Nome(?:\s+do\s+(?:cliente|titular))?)\s*[:\s]/i.test(l),
  );
  if (titLinha) {
    const tm = titLinha.match(/(?:Cliente|Titular|Sacado|Nome(?:\s+do\s+(?:cliente|titular))?)\s*[:\s]+(.+)$/i);
    if (tm) out.titular = tm[1]!.trim();
  }
  if (!out.titular) {
    const titM = flat.match(
      /(?:Cliente|Titular|Nome(?:\s+do\s+(?:cliente|titular))?|Sacado|Responsável)\s*[:\s]+([A-Za-zÀ-ú][A-Za-zÀ-ú\s'.-]{4,50}?)(?:\s+(?:Endere|CNPJ|CPF|Rua|Av\.|CEP)|$)/i,
    );
    if (titM) out.titular = titM[1]!.trim();
  }

  const telM = flat.match(/(?:Tel(?:efone)?|Celular|Fone)\s*[:\s]*([\d()\s\-+]{10,18})/i);
  if (telM) out.telefone = telM[1]!.replace(/\s+/g, " ").trim();

  const emailM = flat.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  if (emailM) out.email = emailM[0]!.toLowerCase();

  const compRotulo = flat.match(
    /(?:Complemento|Compl\.?|Refer[eê]ncia|Ref\.?)\s*[:\s]+([^,\n]{2,50})/i,
  );
  if (compRotulo) out.endereco!.complemento = compRotulo[1]!.trim();

  const compInline = flat.match(
    /,\s*((?:Apto?\.?|Ap\.|Bloco|Bl\.|Casa|Sala|Lote|Lj\.?|Loja|Fundos|Cj\.?|Conj\.?)[^,\n]{0,40})/i,
  );
  if (!out.endereco!.complemento && compInline) {
    out.endereco!.complemento = compInline[1]!.trim();
  }

  const compLinha = findLineValue(
    lines,
    "COMPLEMENTO",
    "COMPL",
    "REFERÊNCIA",
    "REFERENCIA",
    "REF",
  );
  if (!out.endereco!.complemento && compLinha) out.endereco!.complemento = compLinha.trim();

  const logLine = lines.find((l) =>
    /^(?:RUA|R\.|AV\.?|AVENIDA|TRAVESSA|ALAMEDA|RODOVIA|ESTRADA|SERVID[AÃ]O|LINHA|VILA|LARGO|PRA[CÇ]A)\b/i.test(
      l,
    ),
  );
  if (logLine) {
    aplicarLinhaLogradouro(logLine, out.endereco!);
  }

  let logM = !out.endereco!.logradouro
    ? flat.match(
        /((?:RUA|R\.|AV\.?|AVENIDA|TRAVESSA|ALAMEDA|RODOVIA|ESTRADA|SERVID[AÃ]O|LINHA|VILA|LARGO|PRA[CÇ]A)[^,\n]{3,90})/i,
      )
    : null;
  if (!logM) {
    logM = flat.match(
      /(?:Endere[cç]o(?:\s+de\s+(?:instala[cç][aã]o|correspond[eê]ncia|entrega|cobran[cç]a))?|Local(?:\s+de\s+instala[cç][aã]o)?)\s*[:\s]+([^,\n]{5,90})/i,
    );
    if (logM) logM = [logM[0], logM[1]!] as RegExpMatchArray;
  }
  if (logM) {
    aplicarLinhaLogradouro(logM[1]!.replace(/\s+/g, " ").trim(), out.endereco!);
  }

  const logLinha = findLineValue(
    lines,
    "ENDEREÇO",
    "ENDERECO",
    "ENDEREÇO DE INSTALAÇÃO",
    "ENDERECO DE INSTALACAO",
    "LOCAL DE INSTALAÇÃO",
    "LOCAL DE INSTALACAO",
  );
  if (!out.endereco!.logradouro && logLinha) {
    aplicarLinhaLogradouro(logLinha, out.endereco!);
  }

  if (!out.endereco!.numero) {
    const numM = flat.match(/(?:N[°º]|Nº|Numero|Número|Nro\.?)\s*[:\s]*(\d+|S\/N)/i);
    if (numM) out.endereco!.numero = numM[1]!.toUpperCase();
  }

  let bairroM = flat.match(/(?:Bairro|BAIRRO|B\.)\s*[:\s]*([A-Za-zÀ-ú0-9\s'.-]{2,45})/i);
  if (bairroM) out.endereco!.bairro = bairroM[1]!.trim();
  if (!out.endereco!.bairro) {
    const bLinha = findLineValue(lines, "BAIRRO", "B.");
    if (bLinha) out.endereco!.bairro = bLinha.trim();
  }

  let cidM = flat.match(
    /(?:Cidade|Municipio|Município|Munic\.?|Localidade)\s*[:\s]*([A-Za-zÀ-ú\s'.-]{2,45})/i,
  );
  if (cidM) out.endereco!.cidade = cidM[1]!.trim();
  if (!out.endereco!.cidade) {
    const cLinha = findLineValue(lines, "CIDADE", "MUNICÍPIO", "MUNICIPIO", "MUNIC", "LOCALIDADE");
    if (cLinha) {
      const cu = parseCidadeUfToken(cLinha);
      if (cu.cidade) out.endereco!.cidade = cu.cidade;
      if (cu.uf && !out.endereco!.uf) out.endereco!.uf = cu.uf;
    }
  }

  let ufM = flat.match(
    /(?:UF|Estado|U\.F\.)\s*[:\s]*([A-Z]{2}|Acre|Alagoas|Amazonas|Bahia|Ceará|Distrito Federal|Espírito Santo|Goiás|Maranhão|Mato Grosso|Minas Gerais|Pará|Paraíba|Paraná|Pernambuco|Piauí|Rio de Janeiro|Rio Grande do Norte|Rio Grande do Sul|Rondônia|Roraima|Santa Catarina|São Paulo|Sergipe|Tocantins)/i,
  );
  if (ufM) out.endereco!.uf = estadoParaUf(ufM[1]!);
  if (!out.endereco!.uf) {
    const uLinha = findLineValue(lines, "UF", "ESTADO", "U.F.");
    if (uLinha) out.endereco!.uf = estadoParaUf(uLinha.trim());
  }

  for (const ln of lines) {
    const cu = parseCidadeUfToken(ln);
    if (cu.cidade && cu.uf) {
      if (!out.endereco!.cidade) out.endereco!.cidade = cu.cidade;
      if (!out.endereco!.uf) out.endereco!.uf = cu.uf;
    }
  }

  if (cepM) {
    inferirEnderecoProximoCep(lines, cepM[0]!, out.endereco!);
  }

  if (!out.endereco!.logradouro && cepM) {
    const idx = flat.indexOf(cepM[0]!);
    const trecho = flat.slice(Math.max(0, idx - 160), idx);
    const partes = trecho.split(/[,;]/).map((p) => p.trim()).filter(Boolean);
    for (let i = partes.length - 1; i >= 0; i--) {
      const p = partes[i]!;
      if (/^(?:RUA|R\.|AV\.?|AVENIDA|TRAVESSA|ALAMEDA|RODOVIA|ESTRADA)/i.test(p)) {
        out.endereco!.logradouro = p;
        break;
      }
    }
    if (!out.endereco!.logradouro && partes.length) {
      out.endereco!.logradouro = partes[partes.length - 1];
    }
  }

  if (!out.endereco!.cidade) avisos.push("Cidade não encontrada.");
  if (!out.endereco!.bairro) avisos.push("Bairro não encontrado.");
  if (!out.endereco!.uf) avisos.push("UF não encontrada.");

  if (!out.endereco!.logradouro && !out.endereco!.cep) {
    avisos.push("Endereço não identificado — confira o titular e preencha manualmente.");
  }

  return out;
}

function aplicarLinhaLogradouro(rawLog: string, end: EnderecoParse): void {
  const numNoLog = rawLog.match(/^(.+?)[,\s]+(\d+|S\/N)\b(?:\s+(.+))?$/i);
  if (numNoLog) {
    end.logradouro = numNoLog[1]!.trim();
    end.numero = numNoLog[2]!.toUpperCase();
    const resto = numNoLog[3]?.trim();
    if (resto && !end.complemento) end.complemento = resto;
    return;
  }
  end.logradouro = rawLog;
}

function parseCidadeUfToken(token: string): { cidade?: string; uf?: string } {
  const t = token.replace(/\s+/g, " ").trim();
  let m = t.match(/^(.+?)\s*[-\/]\s*([A-Z]{2})$/i);
  if (m) return { cidade: m[1]!.trim(), uf: m[2]!.toUpperCase() };
  m = t.match(/^(.+?)\s+([A-Z]{2})$/i);
  if (m && UF_SIGLAS.has(m[2]!.toUpperCase())) {
    return { cidade: m[1]!.trim(), uf: m[2]!.toUpperCase() };
  }
  for (const [nome, sigla] of Object.entries(ESTADO_UF)) {
    if (new RegExp(nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(t)) {
      const cidade = t.replace(new RegExp(nome, "i"), "").replace(/[-\/]/g, " ").trim();
      return { cidade: cidade || undefined, uf: sigla };
    }
  }
  if (/^[A-Za-zÀ-ú\s'.-]{2,45}$/.test(t)) return { cidade: t };
  return {};
}

function inferirEnderecoProximoCep(lines: string[], cepToken: string, end: EnderecoParse): void {
  const idx = lines.findIndex((l) => l.includes(cepToken.replace(/\D/g, "").slice(0, 5)) || l.includes(cepToken));
  if (idx < 0) return;

  const acima = lines.slice(Math.max(0, idx - 4), idx).filter(Boolean);
  for (let i = acima.length - 1; i >= 0; i--) {
    const ln = acima[i]!;
    if (/^(?:CEP|CNPJ|CPF|VENCIMENTO|TOTAL)/i.test(ln)) continue;

    const cu = parseCidadeUfToken(ln);
    if (cu.cidade && !end.cidade) end.cidade = cu.cidade;
    if (cu.uf && !end.uf) end.uf = cu.uf;
    if (end.cidade && end.uf) break;
  }

  if (!end.bairro && acima.length >= 2) {
    const candidato = acima[acima.length - 2]!;
    if (
      !/^(?:RUA|AV\.?|AVENIDA|TRAVESSA)/i.test(candidato) &&
      candidato.length < 50 &&
      !parseCidadeUfToken(candidato).uf
    ) {
      end.bairro = candidato;
    }
  }
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

const CRLV_LABEL_VALUES = new Set([
  "PLACA",
  "CHASSI",
  "RENAVAM",
  "MARCA / MODELO",
  "MARCA/MODELO",
  "MARCA E MODELO",
  "MARCAMODELO",
  "PLACA ANTERIOR / UF",
  "PLACA ANTERIOR/UF",
  "ANO FABRICAÇÃO / ANO MODELO",
  "ANO FABRICACAO / ANO MODELO",
  "ANO MODELO",
  "ANO/MODELO",
  "ANO DO MODELO",
  "ESPÉCIE / TIPO",
  "ESPECIE / TIPO",
  "COR PREDOMINANTE",
  "COR DO VEÍCULO",
  "COR DO VEICULO",
  "NOME DO PROPRIETÁRIO",
  "NOME DO PROPRIETARIO",
  "PROPRIETÁRIO",
  "PROPRIETARIO",
  "NOME PROPRIETÁRIO",
  "NOME PROPRIETARIO",
  "COMBUSTÍVEL",
  "COMBUSTIVEL",
  "CATEGORIA",
  "CAPACIDADE",
  "POTÊNCIA",
  "POTENCIA",
  "CILINDRADA",
  "LOCAL",
  "DATA",
  "EXERCÍCIO",
  "EXERCICIO",
]);

function normalizeCrlvToken(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function isPlacaValida(token: string): boolean {
  const c = compactPlaca(token);
  if (c.length !== 7) return false;
  if (/^[A-Z]{3}\d{4}$/.test(c)) return true;
  if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(c)) return true;
  return false;
}

function isCrlvLabelLikeValue(val: string): boolean {
  const u = normalizeCrlvToken(val);
  if (!u) return true;
  if (CRLV_LABEL_VALUES.has(u)) return true;
  if (/^(PLACA|CHASSI|RENAVAM|COR|UF|LOCAL|CATEGORIA|COMBUST)/.test(u) && u.length < 40) {
    if (u.includes("/") || u.split(/\s+/).length <= 4) return true;
  }
  return false;
}

type CrlvLabelKey =
  | "placa"
  | "placaAnterior"
  | "chassi"
  | "renavam"
  | "marcaModelo"
  | "anoModelo"
  | "especieTipo"
  | "cor"
  | "proprietario"
  | "uf"
  | "skip";

const CRLV_LABEL_PATTERNS: { key: CrlvLabelKey; patterns: string[]; exact?: boolean }[] = [
  { key: "placa", patterns: ["PLACA"], exact: true },
  { key: "placaAnterior", patterns: ["PLACA ANTERIOR / UF", "PLACA ANTERIOR/UF"] },
  { key: "chassi", patterns: ["CHASSI"], exact: true },
  { key: "renavam", patterns: ["RENAVAM"], exact: true },
  { key: "marcaModelo", patterns: ["MARCA / MODELO", "MARCA/MODELO", "MARCA E MODELO", "MARCAMODELO"] },
  {
    key: "anoModelo",
    patterns: [
      "ANO FABRICAÇÃO / ANO MODELO",
      "ANO FABRICACAO / ANO MODELO",
      "ANO MODELO",
      "ANO/MODELO",
      "ANO DO MODELO",
    ],
  },
  { key: "especieTipo", patterns: ["ESPÉCIE / TIPO", "ESPECIE / TIPO"] },
  { key: "cor", patterns: ["COR PREDOMINANTE", "COR DO VEÍCULO", "COR DO VEICULO"] },
  {
    key: "proprietario",
    patterns: [
      "NOME DO PROPRIETÁRIO",
      "NOME DO PROPRIETARIO",
      "PROPRIETÁRIO",
      "PROPRIETARIO",
      "NOME PROPRIETÁRIO",
      "NOME PROPRIETARIO",
    ],
  },
  { key: "uf", patterns: ["UF", "UF DE REGISTRO", "LOCAL DE REGISTRO"], exact: true },
  { key: "skip", patterns: ["COMBUSTÍVEL", "COMBUSTIVEL", "CATEGORIA", "CAPACIDADE", "POTÊNCIA", "POTENCIA", "CILINDRADA", "LOCAL", "DATA", "EXERCÍCIO", "EXERCICIO"] },
];

function matchCrlvLabelLine(line: string): CrlvLabelKey | null {
  const u = normalizeCrlvToken(line);
  for (const { key, patterns, exact } of CRLV_LABEL_PATTERNS) {
    for (const p of patterns) {
      const pu = p.toUpperCase();
      if (exact) {
        if (u === pu || u === `${pu}:` || u.startsWith(`${pu} `)) {
          if (key === "placa" && u.includes("ANTERIOR")) continue;
          return key;
        }
      } else if (u === pu || u.startsWith(`${pu}:`) || u.startsWith(`${pu} `)) {
        return key;
      }
    }
  }
  return null;
}

function extrairValorInlineCrlv(line: string, label: string): string | null {
  const u = line.toUpperCase();
  const lu = label.toUpperCase();
  const idx = u.indexOf(lu);
  if (idx < 0) return null;
  const rest = line.slice(idx + label.length).replace(/^[\s:/-]+/, "").trim();
  return rest || null;
}

function findCrlvLineValue(lines: string[], ...labels: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const u = normalizeCrlvToken(line);
    for (const lab of labels) {
      const lu = lab.toUpperCase();
      const matches =
        u === lu ||
        u === `${lu}:` ||
        u.startsWith(`${lu} `) ||
        u.startsWith(`${lu}/`) ||
        (lab.includes("/") && u.startsWith(lu));
      if (!matches || line.length >= 80) continue;

      const inline = extrairValorInlineCrlv(line, lab);
      if (inline && !isCrlvLabelLikeValue(inline)) return inline;

      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const v = lines[j]?.trim() || "";
        if (!v || v === "-" || v === ".") continue;
        if (matchCrlvLabelLine(v)) break;
        if (isCrlvLabelLikeValue(v)) continue;
        return v;
      }
    }
  }
  return null;
}

function parseCrlvColumnLayout(lines: string[]): Partial<CrlvParseResult> {
  const out: Partial<CrlvParseResult> = {};
  for (let start = 0; start < lines.length; start++) {
    const keys: CrlvLabelKey[] = [];
    let i = start;
    while (i < lines.length) {
      const key = matchCrlvLabelLine(lines[i]!);
      if (!key) break;
      const labelPatterns = CRLV_LABEL_PATTERNS.find((p) => p.key === key)?.patterns ?? [];
      const pureLabel = labelPatterns.some((p) => normalizeCrlvToken(lines[i]!) === p.toUpperCase());
      if (!pureLabel) break;
      keys.push(key);
      i++;
    }
    if (keys.length < 4) continue;

    const values = lines.slice(i).map((l) => l.trim()).filter(Boolean);
    if (values.length < keys.length) continue;

    for (let k = 0; k < keys.length; k++) {
      const val = values[k];
      if (!val || isCrlvLabelLikeValue(val)) continue;
      assignCrlvField(out, keys[k]!, val);
    }
    if (out.placa || out.chassi || out.marcaModelo) return out;
  }
  return out;
}

function assignCrlvField(out: Partial<CrlvParseResult>, key: CrlvLabelKey, val: string): void {
  const v = val.replace(/\s+/g, " ").trim();
  switch (key) {
    case "placa":
      if (isPlacaValida(v)) out.placa = formatPlacaHyphen(v);
      break;
    case "chassi": {
      const c = v.replace(/\s/g, "").toUpperCase();
      if (/^[A-HJ-NPR-Z0-9]{17}$/.test(c)) out.chassi = c;
      break;
    }
    case "renavam": {
      const d = v.replace(/\D/g, "");
      if (d.length >= 10 && d.length <= 11) out.renavam = d;
      break;
    }
    case "marcaModelo":
      if (v.includes("/") || /[A-Za-z]{2,}/.test(v)) {
        out.marcaModelo = /^[\x00-\x7f]+$/.test(v) ? v.toUpperCase() : v;
      }
      break;
    case "anoModelo": {
      const amClean = v.replace(/\s+/g, "");
      let m2 = amClean.match(/(\d{4})\/(\d{4})/);
      if (!m2) m2 = v.match(/(\d{4})\s*\/\s*(\d{4})/);
      if (m2) out.anoModelo = `${m2[1]}/${m2[2]}`;
      break;
    }
    case "cor":
      if (v.length < 40 && !/^\d+$/.test(v)) out.cor = v.toUpperCase();
      break;
    case "proprietario":
      out.proprietarioNome = v;
      break;
    case "uf":
      if (/^[A-Z]{2}$/.test(v)) out.ufRegistro = v;
      else {
        const um = v.match(/\b([A-Z]{2})\b/);
        if (um) out.ufRegistro = um[1];
      }
      break;
    case "placaAnterior":
    case "especieTipo":
    case "skip":
      break;
    default:
      break;
  }
}

function extrairPlacaCrlv(lines: string[], raw: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (/^PLACA$/i.test(lines[i]!.trim())) {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const v = lines[j]!.trim();
        if (isPlacaValida(v)) return formatPlacaHyphen(v);
      }
    }
  }

  const inline = raw.match(/\bPLACA\s*[:\-]\s*([A-Z0-9-]{7,8})\b/i);
  if (inline?.[1] && isPlacaValida(inline[1])) return formatPlacaHyphen(inline[1]);

  const seen = new Set<string>();
  for (const m of raw.matchAll(/\b([A-Z]{3}[\dA-Z][\dA-Z]{3}|[A-Z]{3}\d{4})\b/gi)) {
    const tok = m[1]!;
    if (!isPlacaValida(tok)) continue;
    const fmt = formatPlacaHyphen(tok);
    const key = compactPlaca(fmt);
    if (seen.has(key)) continue;
    seen.add(key);
    const idx = m.index ?? 0;
    const ctx = raw.slice(Math.max(0, idx - 24), idx + tok.length + 8).toUpperCase();
    if (/PLACA\s+ANTERIOR/.test(ctx)) continue;
    return fmt;
  }
  return null;
}

function isMarcaModeloCrlv(val: string): boolean {
  const u = normalizeCrlvToken(val);
  if (isCrlvLabelLikeValue(val)) return false;
  if (!u.includes("/")) return false;
  const [a, b] = u.split(/\s*\/\s*/);
  if (!a || !b || a.length > 20 || b.length > 45) return false;
  if (CRLV_LABEL_VALUES.has(u)) return false;
  if (/^[A-Z]{2}$/.test(b.trim())) return false;
  if (isPlacaValida(a.trim())) return false;
  if (/^(TIPO|MODELO|UF|CHASSI|RENAVAM|PLACA)$/.test(b.trim())) return false;
  return true;
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
  const lines = lineBlocks(text).filter((ln) => ln.length > 0);
  const raw = lines.join("\n");

  Object.assign(out, parseCrlvColumnLayout(lines));

  let m = raw.match(/CHASSI\s*[:\s]*([A-HJ-NPR-Z0-9]{17})/i);
  if (!m) m = raw.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
  if (m && m[1]!.length === 17) out.chassi = m[1]!.toUpperCase();

  m = raw.match(/RENAVAM\s*[:\s]*(\d{10,11})\b/i);
  if (m) out.renavam = m[1]!;

  if (!out.placa) out.placa = extrairPlacaCrlv(lines, raw) ?? undefined;

  if (!out.marcaModelo) {
    let mm = findCrlvLineValue(
      lines,
      "MARCA / MODELO",
      "MARCA/MODELO",
      "MARCA E MODELO",
      "MARCAMODELO",
    );
    if (mm) {
      mm = mm.replace(/\s+/g, " ").trim();
      if (isMarcaModeloCrlv(mm)) {
        out.marcaModelo = /^[\x00-\x7f]+$/.test(mm) ? mm.toUpperCase() : mm;
      }
    }
  }

  if (!out.anoModelo) {
    const am = findCrlvLineValue(
      lines,
      "ANO FABRICAÇÃO / ANO MODELO",
      "ANO FABRICACAO / ANO MODELO",
      "ANO MODELO",
      "ANO/MODELO",
      "ANO DO MODELO",
    );
    if (am) {
      const amClean = am.replace(/\s+/g, "");
      let m2 = amClean.match(/(\d{4})\/(\d{4})/);
      if (!m2) m2 = am.match(/(\d{4})\s*\/\s*(\d{4})/);
      if (m2) out.anoModelo = `${m2[1]}/${m2[2]}`;
    }
  }

  if (!out.cor) {
    let cor = findCrlvLineValue(
      lines,
      "COR PREDOMINANTE",
      "COR DO VEÍCULO",
      "COR DO VEICULO",
    );
    if (cor) {
      cor = cor.replace(/\s+/g, " ").trim();
      if (cor.length < 40 && !/^\d+$/.test(cor) && !isCrlvLabelLikeValue(cor)) {
        out.cor = cor.toUpperCase();
      }
    }
  }

  if (!out.ufRegistro) {
    const ufM = findCrlvLineValue(lines, "UF", "UF DE REGISTRO", "LOCAL DE REGISTRO");
    if (ufM) {
      const u = ufM.trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(u)) out.ufRegistro = u;
      else {
        const um = u.match(/\b([A-Z]{2})\b/);
        if (um) out.ufRegistro = um[1];
      }
    }
  }

  if (!out.proprietarioNome) {
    let prop = findCrlvLineValue(
      lines,
      "NOME DO PROPRIETÁRIO",
      "NOME DO PROPRIETARIO",
      "PROPRIETÁRIO",
      "PROPRIETARIO",
      "NOME PROPRIETÁRIO",
      "NOME PROPRIETARIO",
    );
    if (!prop) {
      const pm = raw.match(
        /(?:PROPRIET[AÁ]RIO|NOME DO PROPRIET[AÁ]RIO)\s*[:\s]*([A-ZÀ-Ú][A-ZÀ-Ú\s'.-]{4,60})/i,
      );
      if (pm) prop = pm[1]!;
    }
    if (prop && !isPlacaValida(prop) && !/^\d+$/.test(prop.replace(/\D/g, ""))) {
      out.proprietarioNome = prop.replace(/\s+/g, " ").trim();
    }
  }

  if (!out.marcaModelo) {
    for (const m2 of raw.matchAll(/([A-Z0-9][^\n/]{1,18})\s*\/\s*([A-Z0-9][^\n/]{2,40})/gi)) {
      const cand = `${m2[1]!.trim()} / ${m2[2]!.trim()}`;
      if (isMarcaModeloCrlv(cand) && cand.length < 60) {
        out.marcaModelo = cand.toUpperCase();
        break;
      }
    }
  }

  if (!out.placa && !out.chassi) {
    avisos.push("Placa ou chassi não encontrados no CRLV.");
  }

  return out;
}

export async function extrairImagemDocumento(
  buffer: Buffer,
  nomeArquivo: string,
): Promise<{ imagemBase64: string | null; mime: string; avisos: string[] }> {
  const ext = path.extname(nomeArquivo).toLowerCase();
  if (isImagemExt(ext)) {
    const mime =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return { imagemBase64: buffer.toString("base64"), mime, avisos: [] };
  }
  if (ext !== ".pdf") {
    return {
      imagemBase64: null,
      mime: "",
      avisos: [`Formato ${ext || "(sem extensão)"} não suportado.`],
    };
  }
  const jpegs = extrairJpegsEmbutidosPdf(buffer);
  const img = escolherMaiorImagemEmbutida(jpegs);
  if (!img) {
    return {
      imagemBase64: null,
      mime: "",
      avisos: ["Nenhuma imagem JPEG encontrada no PDF."],
    };
  }
  return { imagemBase64: img.toString("base64"), mime: "image/jpeg", avisos: [] };
}

export function parseDocumentoTexto(
  tipo: DocTipoUpload,
  text: string,
): CnhParseResult | ComprovanteParseResult | CrlvParseResult {
  switch (tipo) {
    case "cnh":
      return parseCnhText(text);
    case "comprovante-residencia":
      return parseComprovanteText(text);
    case "crlv":
      return parseCrlvText(text);
    default:
      throw new Error(`Tipo de documento inválido: ${tipo}`);
  }
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

  switch (input.tipo) {
    case "cnh": {
      const { text, avisos: extAvisos } = await extrairTextoCnh(buf, input.nomeArquivo);
      const campos = parseCnhText(text);
      return {
        tipo: input.tipo,
        campos,
        avisos: [...extAvisos, ...campos.avisos],
        textoChars: text.length,
      };
    }
    case "comprovante-residencia": {
      const { text, avisos: extAvisos } = await extrairTextoComprovante(buf, input.nomeArquivo);
      const campos = parseComprovanteText(text);
      return {
        tipo: input.tipo,
        campos,
        avisos: [...extAvisos, ...campos.avisos],
        textoChars: text.length,
      };
    }
    case "crlv": {
      const { text, avisos: extAvisos } = await extrairTextoDocumento(buf, input.nomeArquivo);
      const campos = parseCrlvText(text);
      return {
        tipo: input.tipo,
        campos,
        avisos: [...extAvisos, ...campos.avisos],
        textoChars: text.length,
      };
    }
    default:
      throw new Error(`Tipo de documento inválido: ${input.tipo}`);
  }
}
