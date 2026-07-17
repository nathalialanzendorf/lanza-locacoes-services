import { blobReadWriteToken, isBlobConfigured } from "./config.js";
import {
  deleteLocalMirror,
  getLocalMirror,
  listLocalMirror,
  localMirrorEnabled,
  putLocalMirror,
} from "./localStore.js";
import type { ListBlobsResult, StoredBlob } from "./types.js";

type BlobModule = typeof import("@vercel/blob");

let blobModulePromise: Promise<BlobModule> | null = null;

async function blobModule(): Promise<BlobModule> {
  if (!blobModulePromise) {
    blobModulePromise = import("@vercel/blob");
  }
  return blobModulePromise;
}

function tokenOrThrow(): string {
  const token = blobReadWriteToken();
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN não configurado");
  return token;
}

export async function putBytes(
  pathname: string,
  body: Buffer | string,
  opts?: { contentType?: string; allowOverwrite?: boolean },
): Promise<StoredBlob> {
  const contentType = opts?.contentType;
  if (isBlobConfigured()) {
    const { put } = await blobModule();
    const result = await put(pathname, body, {
      access: "private",
      token: tokenOrThrow(),
      contentType,
      addRandomSuffix: false,
      allowOverwrite: opts?.allowOverwrite ?? true,
    });
    return {
      pathname: result.pathname,
      url: result.url,
      downloadUrl: result.downloadUrl,
      size: result.size,
      uploadedAt: result.uploadedAt.toISOString(),
      contentType: result.contentType,
      backend: "vercel-blob",
    };
  }
  if (localMirrorEnabled()) {
    return putLocalMirror(pathname, body, contentType);
  }
  throw new Error("Armazenamento não configurado (Blob ou espelho local)");
}

export async function putText(
  pathname: string,
  text: string,
  opts?: { contentType?: string; allowOverwrite?: boolean },
): Promise<StoredBlob> {
  return putBytes(pathname, text, {
    contentType: opts?.contentType ?? "text/plain; charset=utf-8",
    allowOverwrite: opts?.allowOverwrite,
  });
}

export async function putJson(
  pathname: string,
  data: unknown,
  opts?: { allowOverwrite?: boolean },
): Promise<StoredBlob> {
  return putText(pathname, JSON.stringify(data, null, 2), {
    contentType: "application/json; charset=utf-8",
    allowOverwrite: opts?.allowOverwrite,
  });
}

export async function getBytes(pathname: string): Promise<Buffer | null> {
  if (isBlobConfigured()) {
    const { get } = await blobModule();
    const result = await get(pathname, { token: tokenOrThrow(), access: "private" });
    if (!result) return null;
    if (result.statusCode !== 200) return null;
    const arr = await result.arrayBuffer();
    return Buffer.from(arr);
  }
  if (localMirrorEnabled()) return getLocalMirror(pathname);
  return null;
}

export async function getText(pathname: string): Promise<string | null> {
  const buf = await getBytes(pathname);
  return buf ? buf.toString("utf8") : null;
}

export async function listBlobs(opts: {
  prefix?: string;
  limit?: number;
  cursor?: string;
}): Promise<ListBlobsResult> {
  if (isBlobConfigured()) {
    const { list } = await blobModule();
    const result = await list({
      prefix: opts.prefix,
      limit: opts.limit ?? 100,
      cursor: opts.cursor,
      token: tokenOrThrow(),
    });
    return {
      blobs: result.blobs.map((b: {
        pathname: string;
        url: string;
        downloadUrl?: string;
        size: number;
        uploadedAt: Date;
        contentType?: string;
      }) => ({
        pathname: b.pathname,
        url: b.url,
        downloadUrl: b.downloadUrl,
        size: b.size,
        uploadedAt: b.uploadedAt.toISOString(),
        contentType: b.contentType,
        backend: "vercel-blob" as const,
      })),
      cursor: result.cursor,
      hasMore: result.hasMore,
    };
  }
  if (localMirrorEnabled()) {
    return listLocalMirror({ prefix: opts.prefix, limit: opts.limit });
  }
  return { blobs: [], hasMore: false };
}

export async function deleteBlob(pathname: string): Promise<boolean> {
  if (isBlobConfigured()) {
    const { del } = await blobModule();
    const listed = await listBlobs({ prefix: pathname, limit: 1 });
    const hit = listed.blobs.find((b) => b.pathname === pathname);
    if (!hit) return false;
    await del(hit.url, { token: tokenOrThrow() });
    return true;
  }
  if (localMirrorEnabled()) return deleteLocalMirror(pathname);
  return false;
}

export async function headBlob(pathname: string): Promise<StoredBlob | null> {
  const listed = await listBlobs({ prefix: pathname, limit: 20 });
  return listed.blobs.find((b) => b.pathname === pathname) ?? null;
}
