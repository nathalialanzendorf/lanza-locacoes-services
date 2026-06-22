/**
 * Autenticação e headers HTTP comuns para rastreame.com.br.
 * Reutilizável por motorista, gastos e outras integrações.
 */

export const RASTREAME_ORIGIN = "https://rastreame.com.br";

const LOGIN_URL = `${RASTREAME_ORIGIN}/auth/rest/login/v2/keek/America@Recife`;

let tokenCache: string | null = null;

/** Limpa cache de token (útil se RASTREAME_AUTH mudar em runtime). */
export function clearRastreameTokenCache(): void {
  tokenCache = null;
}

async function login(): Promise<string | null> {
  const lg = process.env.RASTREAME_LOGIN;
  const sn = process.env.RASTREAME_SENHA;
  if (!lg || !sn) return null;
  const authz = Buffer.from(
    `${lg}&#58;${sn}&#58;${RASTREAME_ORIGIN}`,
    "utf8",
  ).toString("base64");
  try {
    const r = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "0",
        authorization: authz,
        Origin: RASTREAME_ORIGIN,
        Referer: `${RASTREAME_ORIGIN}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/149.0.0.0",
      },
      body: "",
    });
    const raw = await r.text();
    if (!r.ok) {
      console.error(
        `ERRO login rastreame [HTTP ${r.status}]:`,
        raw.slice(0, 200),
      );
      return null;
    }
    const d = JSON.parse(raw) as { accessToken?: string };
    return d.accessToken ?? null;
  } catch (e) {
    console.error("ERRO login rastreame:", e);
    return null;
  }
}

/** Token para pedidos autenticados; `null` se faltar configuração. */
export async function fetchRastreameToken(): Promise<string | null> {
  if (tokenCache) return tokenCache;
  const t = process.env.RASTREAME_AUTH || (await login());
  if (t) tokenCache = t;
  return t;
}

/**
 * Token obrigatório para CLI. Emite erro e termina o processo se não houver.
 */
export async function requireRastreameToken(): Promise<string> {
  const t = await fetchRastreameToken();
  if (!t) {
    console.error(
      "ERRO: defina RASTREAME_LOGIN + RASTREAME_SENHA (ou RASTREAME_AUTH) nas variáveis de ambiente.",
    );
    process.exit(2);
  }
  return t;
}

/**
 * Headers JSON usados pelo site (motorista, gastos, etc.).
 * @param includeOrigin — incluir header `Origin` (POST/PUT).
 */
export async function rastreameJsonHeaders(
  includeOrigin: boolean,
): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "X-r2f-auth": await requireRastreameToken(),
    "X-r2f-ns": "null",
    Referer: `${RASTREAME_ORIGIN}/`,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/149.0.0.0",
  };
  if (includeOrigin) h.Origin = RASTREAME_ORIGIN;
  return h;
}
