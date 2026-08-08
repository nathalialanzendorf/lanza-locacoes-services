/**
 * Persistência da sessão DETRAN RS (Bearer + X-User-Id) — Postgres + ficheiro local.
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

export type DetranRsStoredSession = {
  auth: string;
  userId: string;
  updatedAt: string;
};

export type DetranRsSessionStatus = {
  configured: boolean;
  updatedAt?: string;
  authPreview?: string;
  userIdPreview?: string;
  origem?: "env" | "store";
};

const PORTAL_KEY = "detran-rs";
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "detran-rs");
const SESSION_FILE = path.join(CACHE_DIR, "session.json");

function normalizeAuth(raw: string): string {
  const t = raw.trim();
  return t.startsWith("Bearer ") ? t.slice(7).trim() : t;
}

function preview(value: string | undefined): string | undefined {
  const t = value?.trim();
  if (!t) return undefined;
  if (t.length <= 8) return "…";
  return `…${t.slice(-6)}`;
}

function sessionFromEnv(): DetranRsStoredSession | null {
  const auth = process.env.DETRAN_RS_AUTH?.trim();
  const userId = process.env.DETRAN_RS_USER_ID?.trim();
  if (!auth || !userId) return null;
  return {
    auth: normalizeAuth(auth),
    userId,
    updatedAt: new Date(0).toISOString(),
  };
}

function readFileSession(): DetranRsStoredSession | null {
  const s = readSessionFile<DetranRsStoredSession>(SESSION_FILE);
  if (s?.auth?.trim() && s?.userId?.trim()) {
    return {
      auth: normalizeAuth(s.auth),
      userId: s.userId.trim(),
      updatedAt: s.updatedAt || new Date(0).toISOString(),
    };
  }
  return null;
}

async function readSqlSession(): Promise<DetranRsStoredSession | null> {
  if (!(await useRelationalStore())) return null;
  try {
    const r = await pgQuery<{ payload: DetranRsStoredSession; updated_at: Date | string }>(
      `SELECT payload, updated_at FROM lanza.portal_sessions WHERE portal = $1 LIMIT 1`,
      [PORTAL_KEY],
    );
    const row = r.rows[0];
    if (!row?.payload?.auth?.trim() || !row.payload.userId?.trim()) return null;
    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? row.payload.updatedAt ?? new Date().toISOString());
    return {
      auth: normalizeAuth(row.payload.auth),
      userId: row.payload.userId.trim(),
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function writeSqlSession(session: DetranRsStoredSession): Promise<boolean> {
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

export async function readStoredDetranRsSession(): Promise<DetranRsStoredSession | null> {
  return (await readSqlSession()) ?? readFileSession();
}

export async function saveDetranRsSession(input: {
  auth: string;
  userId: string;
}): Promise<DetranRsStoredSession> {
  const auth = normalizeAuth(input.auth);
  const userId = input.userId.trim();
  if (!auth) throw new Error('Campo "auth" (Bearer) é obrigatório.');
  if (!userId) throw new Error('Campo "userId" (X-User-Id) é obrigatório.');

  const session: DetranRsStoredSession = {
    auth,
    userId,
    updatedAt: new Date().toISOString(),
  };

  const sqlOk = await writeSqlSession(session);
  writeSessionFile(SESSION_FILE, session);
  assertPersistedOnVercel(sqlOk, "DETRAN RS");
  return session;
}

export async function clearStoredDetranRsSession(): Promise<void> {
  deleteSessionFile(SESSION_FILE);
  await deleteSqlSession();
}

export async function obterStatusDetranRsSession(): Promise<DetranRsSessionStatus> {
  const fromEnv = sessionFromEnv();
  if (fromEnv) {
    return {
      configured: true,
      updatedAt: fromEnv.updatedAt,
      authPreview: preview(fromEnv.auth),
      userIdPreview: preview(fromEnv.userId),
      origem: "env",
    };
  }

  const stored = await readStoredDetranRsSession();
  if (!stored) return { configured: false, origem: "store" };

  return {
    configured: true,
    updatedAt: stored.updatedAt,
    authPreview: preview(stored.auth),
    userIdPreview: preview(stored.userId),
    origem: "store",
  };
}
