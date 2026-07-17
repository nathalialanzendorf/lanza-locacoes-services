import fs from "node:fs";
import path from "node:path";

import { localMirrorRoot } from "./config.js";
import type { ListBlobsResult, StoredBlob } from "./types.js";

function mirrorPath(pathname: string): string {
  const root = localMirrorRoot();
  if (!root) throw new Error("Espelho local desativado");
  const rel = pathname.replace(/^\/+/, "");
  return path.resolve(process.cwd(), root, rel);
}

function walkDir(dir: string, prefix: string, out: StoredBlob[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, `${prefix}${entry.name}/`, out);
      continue;
    }
    const stat = fs.statSync(full);
    const pathname = `${prefix}${entry.name}`.replace(/\\/g, "/");
    out.push({
      pathname,
      url: `file://${full}`,
      size: stat.size,
      uploadedAt: stat.mtime.toISOString(),
      backend: "local-mirror",
    });
  }
}

export function localMirrorEnabled(): boolean {
  return Boolean(localMirrorRoot());
}

export async function putLocalMirror(
  pathname: string,
  body: Buffer | string,
  contentType?: string,
): Promise<StoredBlob> {
  const dest = mirrorPath(pathname);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  fs.writeFileSync(dest, buf);
  const stat = fs.statSync(dest);
  return {
    pathname,
    url: `file://${dest}`,
    size: stat.size,
    uploadedAt: stat.mtime.toISOString(),
    contentType,
    backend: "local-mirror",
  };
}

export async function getLocalMirror(pathname: string): Promise<Buffer | null> {
  const dest = mirrorPath(pathname);
  if (!fs.existsSync(dest)) return null;
  return fs.readFileSync(dest);
}

export async function listLocalMirror(opts: {
  prefix?: string;
  limit?: number;
}): Promise<ListBlobsResult> {
  const root = localMirrorRoot();
  if (!root) return { blobs: [], hasMore: false };

  const base = path.resolve(process.cwd(), root);
  const all: StoredBlob[] = [];
  walkDir(base, "", all);

  const prefix = opts.prefix?.replace(/^\/+/, "") ?? "";
  let filtered = prefix ? all.filter((b) => b.pathname.startsWith(prefix)) : all;
  filtered.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

  const limit = opts.limit ?? 100;
  const blobs = filtered.slice(0, limit);
  return {
    blobs,
    hasMore: filtered.length > limit,
  };
}

export async function deleteLocalMirror(pathname: string): Promise<boolean> {
  const dest = mirrorPath(pathname);
  if (!fs.existsSync(dest)) return false;
  fs.unlinkSync(dest);
  return true;
}
