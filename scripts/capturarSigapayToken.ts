/**
 * Abre Chrome no portal SigaPay via CDP e captura cookie/token da rede.
 * Grava num ficheiro temporário do SO (fora do Dropbox); o PowerShell depois
 * lê-o para definir SIGAPAY_* nas variáveis de ambiente e apaga-o.
 *
 * Uso: npx tsx scripts/capturarSigapayToken.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  getSigapayCaptureState,
  startSigapayCapture,
  stopSigapayCapture,
  type SigapayCapturedSession,
} from "../src/lib/sigapay/captureCdp.js";

const CAPTURE_FILE = path.join(os.tmpdir(), "sigapay_capture.json");

function sessaoCompleta(s: SigapayCapturedSession): boolean {
  return Boolean(s.cookie?.trim() || s.token?.trim());
}

async function main(): Promise<void> {
  if (process.platform !== "win32") {
    console.error("Captura SigaPay só funciona no Windows (Chrome + CDP).");
    process.exit(1);
  }

  if (fs.existsSync(CAPTURE_FILE)) fs.rmSync(CAPTURE_FILE, { force: true });

  let captured: SigapayCapturedSession | null = null;

  await startSigapayCapture({
    persist: async (session) => {
      if (!sessaoCompleta(session)) return;
      captured = session;
      fs.writeFileSync(CAPTURE_FILE, JSON.stringify(session, null, 2), "utf8");
      const cookieLen = session.cookie?.length ?? 0;
      const tokenLen = session.token?.length ?? 0;
      console.log(
        `CAPTURA_OK cookie=${cookieLen}c token=${tokenLen}c apiBase=${session.apiBase ?? "?"} file=${CAPTURE_FILE}`,
      );
    },
  });

  console.error(
    "Chrome aberto. Faça login no SigaPay e abra avisos/placas — aguardando captura…",
  );

  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const st = getSigapayCaptureState();
    if (st.status === "captured" && captured && sessaoCompleta(captured)) {
      await stopSigapayCapture(false);
      return;
    }
    if (st.status === "error") {
      console.error(st.message ?? "Erro na captura.");
      await stopSigapayCapture(false);
      process.exit(1);
    }
    if (fs.existsSync(CAPTURE_FILE)) {
      await stopSigapayCapture(false);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  await stopSigapayCapture(false);
  console.error("Tempo esgotado (15 min) — login ou navegação não detectados.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
