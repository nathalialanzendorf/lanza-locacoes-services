export type DbBackend = "file" | "postgres" | "dual";

export type SaveJsonDocumentOptions = {
  description?: string;
  /** Garante que o diretório do ficheiro existe antes de gravar (backend file/dual). */
  mkdir?: boolean;
  /** Adiciona newline final ao JSON gravado em disco. */
  trailingNewline?: boolean;
};

export interface JsonDocumentAdapter {
  exists(storeName: string, filePath: string): boolean;
  load<T>(storeName: string, filePath: string): T;
  save(
    storeName: string,
    filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): void;
  loadAsync<T>(storeName: string, filePath: string): Promise<T | null>;
  saveAsync(
    storeName: string,
    filePath: string,
    data: Record<string, unknown>,
    options?: SaveJsonDocumentOptions,
  ): Promise<void>;
}
