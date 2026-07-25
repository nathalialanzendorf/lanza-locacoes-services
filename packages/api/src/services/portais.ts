import { HttpError } from "../http.js";
import {
  clearDetranScRuntimeSession,
  clearStoredDetranScSession,
  getDetranScCaptureState,
  isDetranScCaptureAvailable,
  obterStatusDetranScSession,
  saveDetranScSession,
  startDetranScCapture,
  stopDetranScCapture,
} from "../lib-imports.js";

export async function statusDetranScSessao() {
  return obterStatusDetranScSession();
}

export async function gravarDetranScSessao(body: {
  auth?: string;
  empresa?: string;
  appVersion?: string | null;
}) {
  const auth = body.auth?.trim();
  const empresa = body.empresa?.trim();
  if (!auth) throw new HttpError(400, 'Campo "auth" (JWT Bearer) é obrigatório.');
  if (!empresa) throw new HttpError(400, 'Campo "empresa" (X-Empresa) é obrigatório.');

  try {
    const saved = await saveDetranScSession({
      auth,
      empresa,
      appVersion: body.appVersion ?? null,
    });
    clearDetranScRuntimeSession();
    const status = await obterStatusDetranScSession();
    return {
      ok: true,
      updatedAt: saved.updatedAt,
      ...status,
    };
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }
}

export async function removerDetranScSessao() {
  await clearStoredDetranScSession();
  clearDetranScRuntimeSession();
  return { ok: true, configured: false };
}

export function statusCapturaDetranSc() {
  return {
    ...getDetranScCaptureState(),
  };
}

export async function iniciarCapturaDetranSc() {
  if (!isDetranScCaptureAvailable()) {
    throw new HttpError(
      501,
      "Captura automática indisponível neste servidor (Vercel). Rode `npm run detran-capture-bridge` no Windows ou defina DETRAN_SC_AUTH no ambiente.",
    );
  }
  return startDetranScCapture();
}

export async function pararCapturaDetranSc() {
  return stopDetranScCapture();
}
