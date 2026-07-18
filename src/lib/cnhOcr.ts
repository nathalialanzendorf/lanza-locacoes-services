import { createWorker, PSM, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function workerPor(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("por");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      return worker;
    })();
  }
  return workerPromise;
}

/** OCR em português — CNH-e (imagem ou JPEG extraído do PDF). */
export async function ocrCnhImagem(buffer: Buffer): Promise<string> {
  const worker = await workerPor();
  const { data } = await worker.recognize(buffer);
  return (data.text ?? "").trim();
}
