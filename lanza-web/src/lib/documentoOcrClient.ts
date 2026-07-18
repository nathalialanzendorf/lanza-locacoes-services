import { createWorker, PSM } from "tesseract.js";

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function workerPor() {
  if (!workerPromise) {
    workerPromise = createWorker("por", 1, {
      logger: () => {},
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      return worker;
    });
  }
  return workerPromise;
}

/** OCR no navegador (fallback quando a API demora ou dá timeout). */
export async function ocrDocumentoNoNavegador(imagemBase64: string, mime = "image/jpeg"): Promise<string> {
  const worker = await workerPor();
  const dataUrl = `data:${mime};base64,${imagemBase64}`;
  const { data } = await worker.recognize(dataUrl);
  return (data.text ?? "").trim();
}
