import { createWorker, PSM } from "tesseract.js";

let workerPromise: ReturnType<typeof createWorker> | null = null;

async function workerPor() {
  if (!workerPromise) {
    workerPromise = createWorker("por", 1, {
      logger: () => {},
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        user_defined_dpi: "300",
      });
      return worker;
    });
  }
  return workerPromise;
}

async function prepararImagemOcrBrowser(imagemBase64: string, mime = "image/jpeg"): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1600;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas indisponível"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const g =
          0.299 * (imgData.data[i] ?? 0) +
          0.587 * (imgData.data[i + 1] ?? 0) +
          0.114 * (imgData.data[i + 2] ?? 0);
        imgData.data[i] = g;
        imgData.data[i + 1] = g;
        imgData.data[i + 2] = g;
      }
      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Falha ao carregar imagem para OCR"));
    img.src = `data:${mime};base64,${imagemBase64}`;
  });
}

/** OCR no navegador — com resize/cinza como no servidor. */
export async function ocrDocumentoNoNavegador(imagemBase64: string, mime = "image/jpeg"): Promise<string> {
  const worker = await workerPor();
  const dataUrl = await prepararImagemOcrBrowser(imagemBase64, mime);
  const { data } = await worker.recognize(dataUrl);
  return (data.text ?? "").trim();
}
