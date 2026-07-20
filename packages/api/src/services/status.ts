import { API_VERSION, apiPublicUrl } from "../config.js";
import {
  createVercelPostgresPool,
  getDbBackend,
  getVercelPostgresPool,
  pgQuery,
  setVercelPostgresPool,
} from "@lanza/db";
import { isBlobConfigured, isStorageActive, localMirrorRoot, storagePrefix } from "../lib-imports.js";
import { obterRastreameEspelhoConfig } from "../lib-imports.js";

export type SystemStatus = {
  status: "ok" | "degraded";
  service: string;
  version: string;
  apiUrl?: string;
  frontendUrl?: string;
  database: {
    backend: string;
    postgres?: { ok: boolean; error?: string };
  };
  storage?: {
    ativo: boolean;
    backend: string;
    prefix: string;
  };
  rastreameEspelho?: ReturnType<typeof obterRastreameEspelhoConfig>;
  git?: {
    commitSha?: string;
    ref?: string;
  };
};

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} (timeout ${ms}ms)`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pingPostgres(): Promise<{ ok: boolean; error?: string }> {
  try {
    await withTimeout(
      (async () => {
        let vercelPool = getVercelPostgresPool();
        if (!vercelPool && process.env.VERCEL && getDbBackend() !== "file") {
          setVercelPostgresPool(createVercelPostgresPool());
          vercelPool = getVercelPostgresPool();
        }
        if (vercelPool) {
          await vercelPool.query("SELECT 1");
          return;
        }
        if (process.env.VERCEL) {
          throw new Error("pool Postgres Vercel indisponível");
        }
        await pgQuery("SELECT 1");
      })(),
      8_000,
      "ping Postgres",
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function obterStatusSistema(): Promise<SystemStatus> {
  const backend = getDbBackend();
  let postgres: { ok: boolean; error?: string } | undefined;

  if (backend !== "file") {
    postgres = await pingPostgres();
  }

  const degraded = postgres?.ok === false;

  return {
    status: degraded ? "degraded" : "ok",
    service: "@lanza/api",
    version: API_VERSION,
    apiUrl: apiPublicUrl(),
    frontendUrl: process.env.LANZA_WEB_URL?.trim() || "https://lanzalocacoes.vercel.app",
    database: {
      backend,
      ...(postgres ? { postgres } : {}),
    },
    storage: {
      ativo: isStorageActive(),
      backend: isBlobConfigured()
        ? "vercel-blob"
        : localMirrorRoot()
          ? "local-mirror"
          : "desativado",
      prefix: storagePrefix(),
    },
    rastreameEspelho: obterRastreameEspelhoConfig(),
    git: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined,
      ref: process.env.VERCEL_GIT_COMMIT_REF?.trim() || undefined,
    },
  };
}
