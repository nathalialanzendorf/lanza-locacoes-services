import path from "node:path";
import { fileURLToPath } from "node:url";

import { createWorker, OEM, PSM, type Worker } from "tesseract.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const WORKER_PATH = path.join(REPO_ROOT, "node_modules/tesseract.js/src/worker-script/node/index.js");
const LANG_PATH = path.join(REPO_ROOT, "node_modules/@tesseract.js-data/por/4.0.0_best_int");
const CACHE_PATH =
  process.env.LANZA_OCR_CACHE?.trim() ||
  process.env.TMPDIR ||
  process.env.TEMP ||
  (process.platform === "win32" ? path.join(process.cwd(), "relatorios", "_tmp", "_ocr-cache") : "/tmp");

const OCR_TIMEOUT_MS = Number(process.env.LANZA_OCR_TIMEOUT_MS ?? 120_000);

let workerPromise: Promise<Worker> | null = null;

function ocrWorkerOptions() {
  return {
    workerPath: WORKER_PATH,
    langPath: LANG_PATH,
    workerBlobURL: false,
    cachePath: CACHE_PATH,
    gzip: true,
  };
}

async function workerPor(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("por", OEM.LSTM_ONLY, ocrWorkerOptions());
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        user_defined_dpi: "300",
      });
      return worker;
    })();
  }
  return workerPromise;
}

/** Pré-carrega WASM + idioma (evita timeout na 1.ª leitura na Vercel). */
export function warmupOcrWorker(): void {
  void workerPor().catch((err) => {
    console.warn("[lanza] OCR warmup falhou:", err);
  });
}

async function prepararImagemOcr(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .grayscale()
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    return buffer;
  }
}

/** OCR em português — documentos escaneados (CNH, comprovante, etc.). */
export async function ocrDocumentoImagem(buffer: Buffer): Promise<string> {
  try {
    const prep = await prepararImagemOcr(buffer);
    const worker = await workerPor();

    const recognizePromise = worker.recognize(prep);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("OCR excedeu o tempo limite")), OCR_TIMEOUT_MS);
    });

    const { data } = await Promise.race([recognizePromise, timeoutPromise]);
    return (data.text ?? "").trim();
  } catch {
    return "";
  }
}

/** @deprecated use ocrDocumentoImagem */
export const ocrCnhImagem = ocrDocumentoImagem;
