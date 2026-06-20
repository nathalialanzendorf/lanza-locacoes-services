import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import PizZip from "pizzip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { brl, cap, valorExtenso } from "./valorExtenso.js";
import { defaultContratosDir } from "./lanzaPaths.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const _MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const UF_NOME: Record<string, string> = {
  SC: "Santa Catarina",
  SP: "São Paulo",
  RS: "Rio Grande do Sul",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  MG: "Minas Gerais",
  BA: "Bahia",
  PE: "Pernambuco",
  CE: "Ceará",
  GO: "Goiás",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
};

function fipeUrlMesAtual(url: string): string {
  if (!url) return url;
  const hoje = new Date();
  return url.replace(
    /\d{1,2}-\d{4}/,
    `${hoje.getMonth() + 1}-${hoje.getFullYear()}`,
  );
}

function parseData(s: string): Date {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Data inválida: ${s}`);
  return new Date(parseInt(m[3]!, 10), parseInt(m[2]!, 10) - 1, parseInt(m[1]!, 10));
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function fmtDataHora(d: Date, hora: string): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy} as ${hora}`;
}

function getPText(p: Element): string {
  const ts = p.getElementsByTagNameNS(W, "t");
  let out = "";
  for (let i = 0; i < ts.length; i++) {
    out += ts[i]!.textContent ?? "";
  }
  return out;
}

function removeHyperlinks(p: Element): void {
  const hls = [...p.getElementsByTagNameNS(W, "hyperlink")];
  for (const hl of hls) {
    const par = hl.parentNode;
    if (par) par.removeChild(hl);
  }
}

function clearParagraphRuns(p: Element): void {
  const toRemove: Node[] = [];
  for (let i = 0; i < p.childNodes.length; i++) {
    const c = p.childNodes[i]!;
    if (c.nodeType !== 1) {
      toRemove.push(c);
      continue;
    }
    const el = c as Element;
    if (el.namespaceURI === W && el.localName === "pPr") continue;
    toRemove.push(c);
  }
  for (const n of toRemove) {
    p.removeChild(n);
  }
}

function appendRun(
  doc: Document,
  p: Element,
  text: string,
  bold: boolean,
): void {
  const r = doc.createElementNS(W, "w:r");
  if (bold) {
    const rPr = doc.createElementNS(W, "w:rPr");
    rPr.appendChild(doc.createElementNS(W, "w:b"));
    r.appendChild(rPr);
  }
  const t = doc.createElementNS(W, "w:t");
  if (/^\s|\s$/.test(text)) {
    t.setAttribute("xml:space", "preserve");
  }
  t.appendChild(doc.createTextNode(text));
  r.appendChild(t);
  p.appendChild(r);
}

function setParagraphRich(
  doc: Document,
  p: Element,
  segments: [string, boolean][],
): void {
  const segs = segments.filter((x) => x[0]);
  if (!segs.length) return;
  removeHyperlinks(p);
  clearParagraphRuns(p);
  for (const [t, b] of segs) {
    appendRun(doc, p, t, b);
  }
}

function deleteParagraph(p: Element): void {
  const par = p.parentNode;
  if (par) par.removeChild(p);
}

function N(t: string): [string, boolean] {
  return [t, false];
}
function B(t: string): [string, boolean] {
  return [t, true];
}

function boldSubstring(
  segments: [string, boolean][],
  sub: string,
): [string, boolean][] {
  if (!sub) return segments;
  const out: [string, boolean][] = [];
  for (const [t, b] of segments) {
    if (b || !t.includes(sub)) {
      out.push([t, b]);
      continue;
    }
    const i = t.indexOf(sub);
    if (i > 0) out.push([t.slice(0, i), false]);
    out.push([sub, true]);
    if (i + sub.length < t.length) {
      out.push([t.slice(i + sub.length), false]);
    }
  }
  return out;
}

function richFromPattern(
  text: string,
  pat: RegExp,
  troca: (m: RegExpExecArray) => string,
): [string, boolean][] {
  const segs: [string, boolean][] = [];
  let last = 0;
  const re = new RegExp(pat.source, pat.flags.includes("g") ? pat.flags : pat.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push(N(text.slice(last, m.index)));
    const novo = troca(m);
    segs.push([novo, novo !== m[0]]);
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push(N(text.slice(last)));
  return segs;
}

function bodyParagraphs(body: Element): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < body.childNodes.length; i++) {
    const n = body.childNodes[i]!;
    if (n.nodeType !== 1) continue;
    const el = n as Element;
    if (el.namespaceURI === W && el.localName === "p") out.push(el);
  }
  return out;
}

function exportDocxToPdfWin(absDocx: string, absPdf: string): boolean {
  const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
  const ps = [
    "$ErrorActionPreference='Stop'",
    "$word = New-Object -ComObject Word.Application",
    "$word.Visible = $false",
    "try {",
    `  $doc = $word.Documents.Open(${q(absDocx)})`,
    `  $doc.SaveAs(${q(absPdf)}, 17)`,
    "  $doc.Close([ref]$false)",
    "} finally {",
    "  $word.Quit()",
    "}",
  ].join("; ");
  try {
    execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
      stdio: "pipe",
      windowsHide: true,
    });
    return fs.existsSync(absPdf);
  } catch (e) {
    console.error("[aviso] PDF nao gerado:", e instanceof Error ? e.message : e);
    return false;
  }
}

export type GerarContratoDados = {
  template: string;
  contratosDir?: string;
  cnhArquivo?: string;
  cliente: {
    nome: string;
    cpf: string;
    endereco?: Record<string, string>;
  };
  veiculo: Record<string, string>;
  prazo: { dias: number; inicio: string; hora?: string };
  valores: { semana: number; caucao: number; diaria?: number };
  cnhCategoria?: string;
  diaPagamento?: string;
  assinatura?: { data?: string; cidade?: string; estado?: string };
};

export function gerar(dados: GerarContratoDados): {
  pasta: string;
  docx: string;
  pdf: string | null;
  cnh: string | null;
} {
  const buf = fs.readFileSync(dados.template);
  const zip = new PizZip(buf);
  const entry = zip.file("word/document.xml");
  if (!entry) throw new Error("word/document.xml ausente no .docx");
  const xml = entry.asText();
  const dom = new DOMParser().parseFromString(xml, "application/xml");
  const docEl = dom.documentElement;
  const bodies = dom.getElementsByTagNameNS(W, "body");
  const body = bodies[0];
  if (!body) throw new Error("w:body não encontrado");

  const paragraphs = bodyParagraphs(body);

  const cli = dados.cliente;
  const end = cli.endereco ?? {};
  const veic = dados.veiculo;
  const prazo = dados.prazo;
  const val = dados.valores;
  const diaria = Number(val.diaria ?? 120);
  const semana = Number(val.semana);
  const caucao = Number(val.caucao);
  const tresDiarias = diaria * 3;
  const categoria = dados.cnhCategoria ?? "B";

  const hora = prazo.hora ?? "18:00";
  const dini = parseData(prazo.inicio);
  const dfim = addDays(dini, Number(prazo.dias));
  const inicioStr = fmtDataHora(dini, hora);
  const fimStr = fmtDataHora(dfim, hora);

  const ufKey = (end.uf ?? "").toUpperCase();
  const estadoCli =
    end.estado || UF_NOME[ufKey] || end.uf || "";
  let log = end.logradouro ?? "";
  if (end.numero) log += `, ${end.numero}`;
  if (end.complemento) log += `, ${end.complemento}`;

  let mm = veic.marcaModelo ?? "";
  const fm = (veic.fipeModelo ?? "").trim();
  if (fm) mm += ` (${fm})`;

  const fipeUrl = fipeUrlMesAtual(veic.fipe ?? "");

  for (const p of paragraphs) {
    const t = getPText(p).trim();
    if (t.startsWith("LOCAT") && getPText(p).includes("CPF")) {
      setParagraphRich(dom, p, [
        N("LOCATÁRIO(a): "),
        B(cli.nome),
        N(", inscrito no CPF sob o n° "),
        B(cli.cpf),
        N(", residente e domiciliado na "),
        B(log),
        N(", bairro "),
        B(end.bairro ?? ""),
        N(", cidade "),
        B(end.cidade ?? ""),
        N(", estado "),
        B(estadoCli),
        N(", CEP "),
        B(end.cep ?? ""),
        N("."),
      ]);
      break;
    }
  }

  const segV: [string, boolean][] = [
    N("1.1 O presente contrato tem como OBJETO a locação do automóvel de placa: "),
    B(veic.placa),
    N(", marca/modelo "),
    B(mm),
  ];
  if (veic.chassi) segV.push(N(", Chassi "), B(veic.chassi));
  if (veic.renavam) segV.push(N(", RENAVAM "), B(veic.renavam));
  segV.push(
    N(", ano/modelo "),
    B(veic.anoModelo),
    N(", cor "),
    B(veic.cor),
    N("."),
  );

  const vehPars = paragraphs.filter((p) =>
    getPText(p).trim().startsWith("1.1 O presente"),
  );
  const fipePars = paragraphs.filter((p) =>
    getPText(p).trim().startsWith("1.1.1"),
  );
  if (vehPars.length) {
    setParagraphRich(dom, vehPars[0]!, segV);
    for (let i = 1; i < vehPars.length; i++) deleteParagraph(vehPars[i]!);
  }
  if (fipePars.length) {
    setParagraphRich(dom, fipePars[0]!, [
      N("1.1.1 Informações tabela Fipe: "),
      B(fipeUrl),
    ]);
    for (let i = 1; i < fipePars.length; i++) deleteParagraph(fipePars[i]!);
  }

  for (const p of bodyParagraphs(body)) {
    const t = getPText(p).trim();
    if (t.startsWith("1.2 A presente")) {
      setParagraphRich(dom, p, [
        N("1.2 A presente locação terá o lapso temporal de validade de "),
        B(`${Number(prazo.dias)} dias`),
        N(", podendo ser renovado por vontade das partes, iniciando no dia "),
        B(inicioStr),
        N(" e terminando no dia "),
        B(fimStr),
        N(
          ", com tolerância de no máximo 1 hora. Data na qual o automóvel deverá ser " +
            "devolvido no estado em que foi locado, sem avarias.",
        ),
      ]);
      break;
    }
  }

  const catpat = /(categoria\s*["“])([^"”]*)(["”])/i;
  for (const p of bodyParagraphs(body)) {
    const full = getPText(p);
    const t = full.trim();
    if (t.startsWith("2.1.") && full.toLowerCase().includes("categoria")) {
      const m = catpat.exec(full);
      if (m) {
        setParagraphRich(dom, p, [
          N(full.slice(0, m.index)),
          N(m[1]!),
          B(categoria),
          N(m[3]!),
          N(full.slice(m.index + m[0].length)),
        ]);
      }
      break;
    }
  }

  const alvos = new Map<number, [number, string]>([
    [650.0, [semana, valorExtenso(semana)]],
    [120.0, [diaria, valorExtenso(diaria)]],
    [1500.0, [caucao, valorExtenso(caucao)]],
    [360.0, [tresDiarias, valorExtenso(tresDiarias)]],
  ]);
  const moneyRe = /R\$\s*([\d.]+,\d{2})\s*\(([^)]*)\)/g;
  function troca(m: RegExpExecArray): string {
    const num = parseFloat(m[1]!.replace(/\./g, "").replace(",", "."));
    for (const [ref, [nv, ext]] of alvos) {
      if (Math.abs(num - ref) < 0.005) {
        return `R$ ${brl(nv)} (${cap(ext)})`;
      }
    }
    return m[0]!;
  }

  const diaPag = dados.diaPagamento;
  for (const p of bodyParagraphs(body)) {
    const orig = getPText(p);
    if (!orig.includes("R$")) continue;
    moneyRe.lastIndex = 0;
    if (!moneyRe.test(orig)) continue;

    moneyRe.lastIndex = 0;
    let t = orig;
    const is32 = orig.trim().startsWith("3.2 O pagamento");
    if (is32 && diaPag) {
      t = t.replace(/todas as segundas-feiras/g, diaPag);
    }
    const novo = t.replace(moneyRe, (whole, g1, g2) => {
      const m = { 0: whole, 1: g1, 2: g2 } as RegExpExecArray;
      return troca(m);
    });
    if (novo !== orig) {
      let segs = richFromPattern(t, moneyRe, (m) => troca(m));
      if (is32 && diaPag) segs = boldSubstring(segs, diaPag);
      setParagraphRich(dom, p, segs);
    }
  }

  const assin = dados.assinatura ?? {};
  let dataAssin = assin.data ?? "auto";
  if (dataAssin === "auto") {
    dataAssin = `${String(dini.getDate()).padStart(2, "0")} de ${_MESES[dini.getMonth()]!} de ${dini.getFullYear()}`;
  }
  const cidadeA = assin.cidade ?? "Tubarão";
  const estadoA = assin.estado ?? "Santa Catarina";
  const dataRe = /\d{1,2} de [A-Za-zçãéíóúâ]+ de \d{4}/;
  for (const p of bodyParagraphs(body)) {
    const full = getPText(p);
    if (dataRe.test(full) && !full.toLowerCase().includes("lapso")) {
      setParagraphRich(dom, p, [
        N(`${cidadeA}, ${estadoA}, `),
        B(dataAssin),
        N("."),
      ]);
      break;
    }
  }

  for (const p of bodyParagraphs(body)) {
    const full = getPText(p);
    if (full.toUpperCase().includes("JOSE FELIPE BARRETO") && !full.toUpperCase().includes("LOCAT")) {
      const m = /(\t+|\s{2,})(JOSE FELIPE BARRETO RODRIGUES)/i.exec(full);
      if (m) {
        setParagraphRich(dom, p, [B(cli.nome), N(full.slice(m.index))]);
      }
      break;
    }
  }

  const nomeCli = cli.nome
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  const baseDir = dados.contratosDir ?? defaultContratosDir();
  const pasta = path.join(
    baseDir,
    `${String(dini.getDate()).padStart(2, "0")}.${String(dini.getMonth() + 1).padStart(2, "0")}.${dini.getFullYear()} - ${nomeCli}`,
  );
  fs.mkdirSync(pasta, { recursive: true });
  const nomeArq = `Contrato - ${nomeCli}`;
  const saidaDocx = path.join(pasta, `${nomeArq}.docx`);
  const saidaPdf = path.join(pasta, `${nomeArq}.pdf`);

  const newXml = new XMLSerializer().serializeToString(docEl);
  zip.file("word/document.xml", newXml);
  fs.writeFileSync(saidaDocx, zip.generate({ type: "nodebuffer" }));

  let pdfOk = false;
  if (process.platform === "win32") {
    pdfOk = exportDocxToPdfWin(path.resolve(saidaDocx), path.resolve(saidaPdf));
  } else {
    console.error("[aviso] PDF via Word COM só no Windows; .docx gerado.");
  }

  let cnhDest: string | null = null;
  const cnhSrc = dados.cnhArquivo;
  if (cnhSrc && fs.existsSync(cnhSrc)) {
    cnhDest = path.join(pasta, "CNH.pdf");
    fs.copyFileSync(cnhSrc, cnhDest);
  }

  return {
    pasta,
    docx: saidaDocx,
    pdf: pdfOk ? saidaPdf : null,
    cnh: cnhDest,
  };
}
