/**
 * Persistência da sessão SigaPay (cookie + token) — Postgres (produção) + ficheiro local.
 */
import path from "node:path";

import { pgQuery, useRelationalStore } from "@lanza/db";

import { REPO_ROOT } from "../repoRoot.js";
import {
  assertPersistedOnVercel,
  deleteSessionFile,
  readSessionFile,
  writeSessionFile,
} from "../sessionStore/localCache.js";

export type SigapayStoredSession = {
  cookie?: string;
  token?: string;
  apiBase?: string | null;
  updatedAt: string;
};

export type SigapaySessionStatus = {
  configured: boolean;
  updatedAt?: string;
  cookiePreview?: string;
  tokenPreview?: string;
  origem?: "env" | "store";
};

const PORTAL_KEY = "sigapay";
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "sigapay");
const SESSION_FILE = path.join(CACHE_DIR, "session.json");

function preview(value: string | undefined): string | undefined {
  const t = value?.trim();
  if (!t) return undefined;
  if (t.length <= 8) return "…";
  return `…${t.slice(-6)}`;
}

function tokenLimpo(raw: string): string {
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function sessionFromEnv(): SigapayStoredSession | null {
  const cookie = process.env.SIGAPAY_COOKIE?.trim();
  const token = process.env.SIGAPAY_TOKEN?.trim();
  if (!cookie && !token) return null;
  return {
    cookie: cookie || undefined,
    token: token ? tokenLimpo(token) : undefined,
    apiBase: process.env.SIGAPAY_API_BASE?.trim() || null,
    updatedAt: new Date(0).toISOString(),
  };
}

function readFileSession(): SigapayStoredSession | null {
  const s = readSessionFile<SigapayStoredSession>(SESSION_FILE);
  if (s?.cookie?.trim() || s?.token?.trim()) {
    return {
      cookie: s.cookie?.trim() || undefined,
      token: s.token ? tokenLimpo(s.token) : undefined,
      apiBase: s.apiBase?.trim() || null,
      updatedAt: s.updatedAt || new Date(0).toISOString(),
    };
  }
  return null;
}

async function readSqlSession(): Promise<SigapayStoredSession | null> {
  if (!(await useRelationalStore())) return null;
  try {
    const r = await pgQuery<{ payload: SigapayStoredSession; updated_at: Date | string }>(
      `SELECT payload, updated_at FROM lanza.portal_sessions WHERE portal = $1 LIMIT 1`,
      [PORTAL_KEY],
    );
    const row = r.rows[0];
    if (!row?.payload) return null;
    if (!row.payload.cookie?.trim() && !row.payload.token?.trim()) return null;
    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? row.payload.updatedAt ?? new Date().toISOString());
    return {
      cookie: row.payload.cookie?.trim() || undefined,
      token: row.payload.token ? tokenLimpo(row.payload.token) : undefined,
      apiBase: row.payload.apiBase?.trim() || null,
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function writeSqlSession(session: SigapayStoredSession): Promise<boolean> {
  if (!(await useRelationalStore())) return false;
  await pgQuery(
    `INSERT INTO lanza.portal_sessions (portal, payload, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (portal) DO UPDATE
       SET payload = EXCLUDED.payload, updated_at = now()`,
    [PORTAL_KEY, JSON.stringify(session)],
  );
  return true;
}

async function deleteSqlSession(): Promise<boolean> {
  if (!(await useRelationalStore())) return false;
  await pgQuery(`DELETE FROM lanza.portal_sessions WHERE portal = $1`, [PORTAL_KEY]);
  return true;
}

export async function readStoredSigapaySession(): Promise<SigapayStoredSession | null> {
  return (await readSqlSession()) ?? readFileSession();
}

export async function saveSigapaySession(input: {
  cookie?: string;
  token?: string;
  apiBase?: string | null;
}): Promise<SigapayStoredSession> {
  const cookie = input.cookie?.trim() || undefined;
  const token = input.token?.trim() ? tokenLimpo(input.token) : undefined;
  if (!cookie && !token) {
    throw new Error('Informe "cookie" e/ou "token" da sessão SigaPay.');
  }

  const session: SigapayStoredSession = {
    cookie,
    token,
    apiBase: input.apiBase?.trim() || null,
    updatedAt: new Date().toISOString(),
  };

  const sqlOk = await writeSqlSession(session);
  writeSessionFile(SESSION_FILE, session);
  assertPersistedOnVercel(sqlOk, "SigaPay");
  return session;
}

export async function clearStoredSigapaySession(): Promise<void> {
  deleteSessionFile(SESSION_FILE);
  await deleteSqlSession();
}

export async function obterStatusSigapaySession(): Promise<SigapaySessionStatus> {
  const fromEnv = sessionFromEnv();
  if (fromEnv) {
    return {
      configured: true,
      updatedAt: fromEnv.updatedAt,
      cookiePreview: preview(fromEnv.cookie),
      tokenPreview: preview(fromEnv.token),
      origem: "env",
    };
  }

  const stored = await readStoredSigapaySession();
  if (!stored) return { configured: false, origem: "store" };

  return {
    configured: true,
    updatedAt: stored.updatedAt,
    cookiePreview: preview(stored.cookie),
    tokenPreview: preview(stored.token),
    origem: "store",
  };
}
