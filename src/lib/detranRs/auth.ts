/**
 * Autenticação e headers HTTP para o DETRAN RS (PROCERGS / pcsdetran).
 */
import { loadLocalEnv } from "../loadLocalEnv.js";

loadLocalEnv();

if (
  process.env.DETRAN_RS_TLS_INSECURE === "1" ||
  process.env.DETRAN_SC_TLS_INSECURE === "1" ||
  process.env.RASTREAME_TLS_INSECURE === "1"
) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export const DETRAN_RS_ORIGIN = "https://pcsdetran.rs.gov.br";
export const DETRAN_RS_API_BASE =
  "https://pcsdetran.procergs.com.br/pcsdetran/rest";

export type DetranRsSessionCredentials = {
  auth: string;
  userId: string;
};

let runtimeSession: DetranRsSessionCredentials | null = null;

export function clearDetranRsRuntimeSession(): void {
  runtimeSession = null;
}

function normalizeAuth(raw: string): string {
  const t = raw.trim();
  return t.startsWith("Bearer ") ? t.slice(7).trim() : t;
}

function sessionFromEnv(): DetranRsSessionCredentials | null {
  const auth = process.env.DETRAN_RS_AUTH?.trim();
  const userId = process.env.DETRAN_RS_USER_ID?.trim();
  if (!auth || !userId) return null;
  return { auth: normalizeAuth(auth), userId };
}

export async function resolveDetranRsSession(): Promise<DetranRsSessionCredentials | null> {
  const fromEnv = sessionFromEnv();
  if (fromEnv) return fromEnv;
  if (runtimeSession) return runtimeSession;

  const { readStoredDetranRsSession } = await import("./sessionStore.js");
  const stored = await readStoredDetranRsSession();
  if (!stored) return null;

  runtimeSession = { auth: stored.auth, userId: stored.userId };
  return runtimeSession;
}

export function requireDetranRsAuth(): string {
  const t = process.env.DETRAN_RS_AUTH?.trim();
  if (!t) {
    console.error(
      "ERRO: defina DETRAN_RS_AUTH (Bearer) ou grave a sessão via API/UI (Relatórios → Dados do veículo).",
    );
    process.exit(2);
  }
  return normalizeAuth(t);
}

export function requireDetranRsUserId(): string {
  const u = process.env.DETRAN_RS_USER_ID?.trim();
  if (!u) {
    console.error("ERRO: defina DETRAN_RS_USER_ID (header X-User-Id).");
    process.exit(2);
  }
  return u;
}

export async function detranRsJsonHeaders(): Promise<Record<string, string>> {
  const session = await resolveDetranRsSession();
  if (!session) {
    throw new Error(
      "DETRAN RS: sessão não configurada. Defina DETRAN_RS_AUTH + DETRAN_RS_USER_ID no servidor ou capture via Relatórios → Dados do veículo.",
    );
  }

  return {
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${session.auth}`,
    Origin: DETRAN_RS_ORIGIN,
    Referer: `${DETRAN_RS_ORIGIN}/`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "X-User-Id": session.userId,
  };
}
