/**
 * Persistência da sessão Pedágio Digital (cookie + CSRF) — Postgres + ficheiro local.
 */
import fs from "node:fs";
import path from "node:path";

import { pgQuery, useRelationalStore } from "@lanza/db";

import { REPO_ROOT } from "../repoRoot.js";

export type PedagioStoredSession = {
  cookie: string;
  csrf: string;
  updatedAt: string;
};

export type PedagioSessionStatus = {
  configured: boolean;
  updatedAt?: string;
  cookiePreview?: string;
  csrfPreview?: string;
  origem?: "env" | "store";
};

const PORTAL_KEY = "pedagio-digital";
const CACHE_DIR = path.join(REPO_ROOT, ".cache", "pedagio-digital");
const SESSION_FILE = path.join(CACHE_DIR, "session.json");

function preview(value: string | undefined): string | undefined {
  const t = value?.trim();
  if (!t) return undefined;
  if (t.length <= 8) return "…";
  return `…${t.slice(-6)}`;
}

function sessionFromEnv(): PedagioStoredSession | null {
  const cookie = process.env.PEDAGIO_DIGITAL_COOKIE?.trim();
  const csrf = process.env.PEDAGIO_DIGITAL_CSRF?.trim();
  if (!cookie || !csrf) return null;
  return { cookie, csrf, updatedAt: new Date(0).toISOString() };
}

function readFileSession(): PedagioStoredSession | null {
  try {
    const raw = fs.readFileSync(SESSION_FILE, "utf8");
    const s = JSON.parse(raw) as PedagioStoredSession;
    if (s?.cookie?.trim() && s?.csrf?.trim()) {
      return {
        cookie: s.cookie.trim(),
        csrf: s.csrf.trim(),
        updatedAt: s.updatedAt || new Date(0).toISOString(),
      };
    }
  } catch {
    /* sem cache */
  }
  return null;
}

function writeFileSession(session: PedagioStoredSession): void {
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

async function readSqlSession(): Promise<PedagioStoredSession | null> {
  if (!(await useRelationalStore())) return null;
  try {
    const r = await pgQuery<{ payload: PedagioStoredSession; updated_at: Date | string }>(
      `SELECT payload, updated_at FROM lanza.portal_sessions WHERE portal = $1 LIMIT 1`,
      [PORTAL_KEY],
    );
    const row = r.rows[0];
    if (!row?.payload?.cookie?.trim() || !row.payload.csrf?.trim()) return null;
    const updatedAt =
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? row.payload.updatedAt ?? new Date().toISOString());
    return {
      cookie: row.payload.cookie.trim(),
      csrf: row.payload.csrf.trim(),
      updatedAt,
    };
  } catch {
    return null;
  }
}

async function writeSqlSession(session: PedagioStoredSession): Promise<boolean> {
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

export async function readStoredPedagioSession(): Promise<PedagioStoredSession | null> {
  return (await readSqlSession()) ?? readFileSession();
}

export async function savePedagioSession(input: {
  cookie: string;
  csrf: string;
}): Promise<PedagioStoredSession> {
  const cookie = input.cookie.trim();
  const csrf = input.csrf.trim();
  if (!cookie) throw new Error('Campo "cookie" é obrigatório.');
  if (!csrf) throw new Error('Campo "csrf" (x-csrf-token) é obrigatório.');

  const session: PedagioStoredSession = {
    cookie,
    csrf,
    updatedAt: new Date().toISOString(),
  };

  writeFileSession(session);
  await writeSqlSession(session);
  return session;
}

export async function clearStoredPedagioSession(): Promise<void> {
  deleteFileSession();
  await deleteSqlSession();
}

export async function obterStatusPedagioSession(): Promise<PedagioSessionStatus> {
  const fromEnv = sessionFromEnv();
  if (fromEnv) {
    return {
      configured: true,
      updatedAt: fromEnv.updatedAt,
      cookiePreview: preview(fromEnv.cookie),
      csrfPreview: preview(fromEnv.csrf),
      origem: "env",
    };
  }

  const stored = await readStoredPedagioSession();
  if (!stored) return { configured: false, origem: "store" };

  return {
    configured: true,
    updatedAt: stored.updatedAt,
    cookiePreview: preview(stored.cookie),
    csrfPreview: preview(stored.csrf),
    origem: "store",
  };
}
