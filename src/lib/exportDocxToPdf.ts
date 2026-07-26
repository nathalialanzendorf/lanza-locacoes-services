import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function convertApiSecret(): string | null {
  return (
    process.env.CONVERTAPI_SECRET?.trim() ||
    process.env.LANZA_CONVERTAPI_SECRET?.trim() ||
    null
  );
}

function qPs(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

/** Converte DOCX → PDF via Microsoft Word (Windows local). */
export function exportDocxToPdfWin(absDocx: string, absPdf: string): boolean {
  const ps = [
    "$ErrorActionPreference='Stop'",
    "$word = New-Object -ComObject Word.Application",
    "$word.Visible = $false",
    "try {",
    `  $doc = $word.Documents.Open(${qPs(absDocx)})`,
    `  $doc.SaveAs(${qPs(absPdf)}, 17)`,
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
    console.error("[aviso] PDF Word COM nao gerado:", e instanceof Error ? e.message : e);
    return false;
  }
}

type ConvertApiFile = {
  FileName?: string;
  FileExt?: string;
  FileSize?: number;
  FileData?: string;
  Url?: string;
};

/** Converte DOCX → PDF via ConvertAPI (Vercel/Linux). Requer CONVERTAPI_SECRET. */
export async function exportDocxToPdfConvertApi(
  absDocx: string,
  absPdf: string,
): Promise<boolean> {
  const secret = convertApiSecret();
  if (!secret) return false;

  const docxBuffer = fs.readFileSync(absDocx);
  const form = new FormData();
  form.append("File", new Blob([docxBuffer]), path.basename(absDocx));
  form.append("StoreFile", "false");

  const res = await fetch("https://v2.convertapi.com/convert/docx/to/pdf", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[aviso] ConvertAPI falhou:", res.status, detail.slice(0, 500));
    return false;
  }

  const payload = (await res.json()) as { Files?: ConvertApiFile[] };
  const file = payload.Files?.[0];
  if (!file) {
    console.error("[aviso] ConvertAPI sem ficheiro na resposta");
    return false;
  }

  let pdfBuffer: Buffer | null = null;
  if (file.FileData) {
    pdfBuffer = Buffer.from(file.FileData, "base64");
  } else if (file.Url) {
    const dl = await fetch(file.Url);
    if (!dl.ok) {
      console.error("[aviso] ConvertAPI download falhou:", dl.status);
      return false;
    }
    pdfBuffer = Buffer.from(await dl.arrayBuffer());
  }

  if (!pdfBuffer?.length) {
    console.error("[aviso] ConvertAPI resposta vazia");
    return false;
  }

  fs.writeFileSync(absPdf, pdfBuffer);
  return fs.existsSync(absPdf);
}

/** Gera PDF a partir de DOCX já gravado (Word local ou ConvertAPI na nuvem). */
export async function ensurePdfFromDocx(absDocx: string, absPdf: string): Promise<boolean> {
  if (fs.existsSync(absPdf)) return true;
  if (!fs.existsSync(absDocx)) return false;

  if (process.platform === "win32") {
    if (exportDocxToPdfWin(path.resolve(absDocx), path.resolve(absPdf))) return true;
  }

  if (await exportDocxToPdfConvertApi(path.resolve(absDocx), path.resolve(absPdf))) {
    return true;
  }

  return false;
}

export function pdfCloudConfigured(): boolean {
  return Boolean(convertApiSecret());
}
