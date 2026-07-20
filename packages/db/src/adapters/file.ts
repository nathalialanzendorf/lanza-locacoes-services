import fs from "node:fs";
import path from "node:path";

import { isReadOnlyServerlessFs } from "../util/serverlessFs.js";
import type { JsonDocumentAdapter, SaveJsonDocumentOptions } from "./types.js";

export class FileJsonDocumentAdapter implements JsonDocumentAdapter {
  exists(_storeName: string, filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  load<T>(_storeName: string, filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  }

  save(
    _storeName: string,
    filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): void {
    if (isReadOnlyServerlessFs()) return;
    if (options?.mkdir) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    const body = JSON.stringify(data, null, 2) + (options?.trailingNewline ? "\n" : "");
    fs.writeFileSync(filePath, body, "utf8");
  }

  async loadAsync<T>(_storeName: string, filePath: string): Promise<T | null> {
    if (!fs.existsSync(filePath)) return null;
    return this.load<T>(_storeName, filePath);
  }

  async saveAsync(
    storeName: string,
    filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): Promise<void> {
    this.save(storeName, filePath, data, options);
  }
}
