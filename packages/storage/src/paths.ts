import path from "node:path";

import { storagePrefix } from "./config.js";

export function blobKey(...parts: string[]): string {
  const joined = [storagePrefix(), ...parts]
    .flatMap((p) => p.split(/[/\\]+/))
    .filter(Boolean)
    .join("/");
  return joined.replace(/\/+/g, "/");
}

/** Converte caminho absoluto do repo para chave relativa em relatorios/… */
export function relPathFromRepo(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  const markers = ["relatorios/", "Relatórios/", "Financeiro/"];
  for (const m of markers) {
    const idx = normalized.toLowerCase().indexOf(m.toLowerCase());
    if (idx >= 0) return normalized.slice(idx);
  }
  return path.join("uploads", path.basename(absPath)).replace(/\\/g, "/");
}

export function blobKeyFromLocalFile(absPath: string, categoryPrefix?: string): string {
  const base = path.basename(absPath);
  if (categoryPrefix) return blobKey(categoryPrefix, base);
  return blobKey(relPathFromRepo(absPath));
}

export function mimeFromFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case ".json":
      return "application/json; charset=utf-8";
    case ".txt":
    case ".md":
      return "text/plain; charset=utf-8";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
