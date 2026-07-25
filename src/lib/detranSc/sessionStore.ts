/**
 * Persistência da sessão DETRAN SC (JWT + X-Empresa) — Postgres (produção) + ficheiro local.
 */
import fs from "node:fs";
import path from "node:path";

import { pgQuery, useRelationalStore } from "@lanza/db";

import { REPO_ROOT } from "../repoRoot.js";

export type DetranScStoredSession = {
  auth: string;
  empresa: string;
  appVersion?: string | null;
  updatedAt: string;
};

export type DetranScSessionStatus = {
  configured: boolean;
  updatedAt?: string;
  empresa?: string;
  authPreview?: string;
  origem?: "env" | "store";
};

const PORTAL_KEY = "detran-sc";
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "detran-sc");
const SESSION_FILE = path.join(CACHE_DIR, "session.json");

function normalizeAuth(raw: string): string {
  const t = raw.trim();
  return t.startsWith("Bearer ") ? t.slice(7).trim() : t;
}

function authPreview(auth: string): string {
  const t = normalizeAuth(auth);
  if (t.length <= 8) return "…";
  return `…${t.slice(-6)}`;
}

function sessionFromEnv(): DetranScStoredSession | null {
  const auth = process.env.DETRAN_SC_AUTH?.trim();
  const empresa = process.env.DETRAN_SC_EMPRESA?.trim();
  if (!auth || !empresa) return null;
  return {
    auth: normalizeAuth(auth),
    empresa,
    appVersion: process.env.DETRAN_SC_APP_VERSION?.trim() || null,
    updatedAt: new Date(0).toISOString(),
  };
}

function readFileSession(): DetranScStoredSession | null {
  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf8");
    const s = JSON.parse(raw) as DetranScStoredSession;
    if (s?.auth?.trim() && s?.empresa?.trim()) {
      return {
        auth: normalizeAuth(s.auth),
        empresa: s.empresa.trim(),
        appVersion: s.appVersion?.trim() || null,
        updatedAt: s.updatedAt || new Date(0).toISOString(),
      };
    }
  } catch {
    /* sem cache */
  }
  return null;
}

function writeFileSession(session: DetranScStoredSession): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2) + "\n", "utf8");
}

function deleteFileSession(): void {
  try {
    fs.rmSync(SESSION_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

async function readSqlSession(): Promise<DetranScStoredSession | null> {
  if (!(await useRelationalStore())) return null;
  try {
    const r = await pgQuery<{ payload: DetranScStoredSession; updated_at: Date | string }>(
      `SELECT payload, updated_at FROM lanza.portal_sessions WHERE portal = $1 LIMIT 1`,
      [PORTAL_KEY],
    );
    const row = r.rows[0];
    if (!row?.payload?.auth?.trim() || !row.payload.empresa?.trim()) return null;
    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? row.payload.updatedAt ?? new Date().toISOString());
    return {
      auth: normalizeAuth(row.payload.auth),
      empresa: row.payload.empresa.trim(),
      appVersion: row.payload.appVersion?.trim() || null,
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function writeSqlSession(session: DetranScStoredSession): Promise<boolean> {
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

/** Lê sessão persistida (Postgres > ficheiro). Não inclui variáveis de ambiente. */
export async function readStoredDetranScSession(): Promise<DetranScStoredSession | null> {
  return (await readSqlSession()) ?? readFileSession();
}

export async function saveDetranScSession(input: {
  auth: string;
  empresa: string;
  appVersion?: string | null;
}): Promise<DetranScStoredSession> {
  const auth = normalizeAuth(input.auth);
  const empresa = input.empresa.trim();
  if (!auth) throw new Error('Campo "auth" (JWT) é obrigatório.');
  if (!empresa) throw new Error('Campo "empresa" (X-Empresa) é obrigatório.');

  const session: DetranScStoredSession = {
    auth,
    empresa,
    appVersion: input.appVersion?.trim() || null,
    updatedAt: new Date().toISOString(),
  };

  writeFileSession(session);
  await writeSqlSession(session);
  return session;
}

export async function clearStoredDetranScSession(): Promise<void> {
  deleteFileSession();
  await deleteSqlSession();
}

export async function obterStatusDetranScSession(): Promise<DetranScSessionStatus> {
  const fromEnv = sessionFromEnv();
  if (fromEnv) {
    return {
      configured: true,
      updatedAt: fromEnv.updatedAt,
      empresa: fromEnv.empresa,
      authPreview: authPreview(fromEnv.auth),
      origem: "env",
    };
  }

  const stored = await readStoredDetranScSession();
  if (!stored) return { configured: false, origem: "store" };

  return {
    configured: true,
    updatedAt: stored.updatedAt,
    empresa: stored.empresa,
    authPreview: authPreview(stored.auth),
    origem: "store",
  };
}
