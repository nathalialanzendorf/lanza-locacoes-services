/**
 * Autenticação e headers HTTP para servicos.detran.sc.gov.br / transito-api.
 */
import { loadLocalEnv } from "../loadLocalEnv.js";

loadLocalEnv();

// Redes com interceptação TLS (proxy/firewall) fazem o Node falhar com
// UNABLE_TO_VERIFY_LEAF_SIGNATURE ao chamar backend.detran.sc.gov.br.
// Mesma necessidade do Rastreame/Pedágio — ativar via DETRAN_SC_TLS_INSECURE=1.
if (
  process.env.DETRAN_SC_TLS_INSECURE === "1" ||
  process.env.RASTREAME_TLS_INSECURE === "1"
) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export const DETRAN_SC_ORIGIN = "https://servicos.detran.sc.gov.br";
export const DETRAN_SC_API_BASE =
  "https://backend.detran.sc.gov.br/transito-api";

const DEFAULT_APP_VERSION = "2026-06-26-1612";

export function detranScAppVersion(): string {
  return process.env.DETRAN_SC_APP_VERSION?.trim() || DEFAULT_APP_VERSION;
}

export function requireDetranScAuth(): string {
  const t = process.env.DETRAN_SC_AUTH?.trim();
  if (!t) {
    console.error(
      "ERRO: defina DETRAN_SC_AUTH (Bearer JWT) nas variáveis de ambiente do utilizador/sistema — não use `.env` para credenciais.",
    );
    console.error(
      "Obter em servicos.detran.sc.gov.br → DevTools → Network → pedido com Authorization.",
    );
    console.error(
      "Alternativa: grave a sessão via API/UI (Relatórios → Dados do veículo → DETRAN SC).",
    );
    process.exit(2);
  }
  return t.startsWith("Bearer ") ? t.slice(7) : t;
}

export function requireDetranScEmpresa(): string {
  const e = process.env.DETRAN_SC_EMPRESA?.trim();
  if (!e) {
    console.error(
      "ERRO: defina DETRAN_SC_EMPRESA (header X-Empresa) nas variáveis de ambiente do utilizador/sistema.",
    );
    process.exit(2);
  }
  return e;
}

function normalizeDetranScAuth(raw: string): string {
  const t = raw.trim();
  return t.startsWith("Bearer ") ? t.slice(7) : t;
}

export type DetranScSessionCredentials = {
  auth: string;
  empresa: string;
  appVersion?: string | null;
};

let runtimeSession: DetranScSessionCredentials | null = null;

/** Limpa cache em memória (após gravar nova sessão ou 401). */
export function clearDetranScRuntimeSession(): void {
  runtimeSession = null;
}

function sessionFromEnv(): DetranScSessionCredentials | null {
  const auth = process.env.DETRAN_SC_AUTH?.trim();
  const empresa = process.env.DETRAN_SC_EMPRESA?.trim();
  if (!auth || !empresa) return null;
  return {
    auth: normalizeDetranScAuth(auth),
    empresa,
    appVersion: process.env.DETRAN_SC_APP_VERSION?.trim() || null,
  };
}

/** Resolve credenciais: env > memória > store persistido. */
export async function resolveDetranScSession(): Promise<DetranScSessionCredentials | null> {
  const fromEnv = sessionFromEnv();
  if (fromEnv) return fromEnv;
  if (runtimeSession) return runtimeSession;

  const { readStoredDetranScSession } = await import("./sessionStore.js");
  const stored = await readStoredDetranScSession();
  if (!stored) return null;

  runtimeSession = {
    auth: stored.auth,
    empresa: stored.empresa,
    appVersion: stored.appVersion ?? null,
  };
  return runtimeSession;
}

/** Headers para API/consultas — resolve sessão persistida quando env não está definido. */
export async function detranScJsonHeaders(
  override?: Partial<DetranScSessionCredentials>,
): Promise<Record<string, string>> {
  const session =
    override?.auth && override?.empresa
      ? {
          auth: normalizeDetranScAuth(override.auth),
          empresa: override.empresa.trim(),
          appVersion: override.appVersion ?? null,
        }
      : await resolveDetranScSession();

  if (!session) {
    throw new Error(
      "DETRAN SC: sessão não configurada. Defina DETRAN_SC_AUTH + DETRAN_SC_EMPRESA no servidor ou grave o token em Relatórios → Dados do veículo.",
    );
  }

  return {
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${session.auth}`,
    Origin: DETRAN_SC_ORIGIN,
    Referer: `${DETRAN_SC_ORIGIN}/`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "X-App-Version": session.appVersion?.trim() || detranScAppVersion(),
    "X-Empresa": session.empresa,
  };
}

/** Headers síncronos — só variáveis de ambiente (CLI/scripts locais). */
export function detranScJsonHeadersSync(): Record<string, string> {
  return {
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${requireDetranScAuth()}`,
    Origin: DETRAN_SC_ORIGIN,
    Referer: `${DETRAN_SC_ORIGIN}/`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "X-App-Version": detranScAppVersion(),
    "X-Empresa": requireDetranScEmpresa(),
  };
}
