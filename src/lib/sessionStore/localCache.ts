/**
 * Cache de sessão em ficheiro — só em ambiente local (Vercel não tem FS gravável).
 */
import fs from "node:fs";
import path from "node:path";

export function localSessionFileEnabled(): boolean {
  return !process.env.VERCEL;
}

export function writeSessionFile(filePath: string, data: unknown): void {
  if (!localSessionFileEnabled()) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
  } catch {
    /* filesystem read-only ou indisponível */
  }
}

export function deleteSessionFile(filePath: string): void {
  if (!localSessionFileEnabled()) return;
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    /* ignore */
  }
}

export function readSessionFile<T>(filePath: string): T | null {
  if (!localSessionFileEnabled()) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function assertPersistedOnVercel(sqlOk: boolean, portalLabel: string): void {
  if (process.env.VERCEL && !sqlOk) {
    throw new Error(
      `${portalLabel}: PostgreSQL indisponível na Vercel — confirme LANZA_DB_BACKEND=postgres e a migration portal_sessions.`,
    );
  }
}
