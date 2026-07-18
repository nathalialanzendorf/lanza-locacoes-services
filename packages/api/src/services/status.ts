import { API_VERSION, apiPublicUrl } from "../config.js";
import { getDbBackend, getVercelPostgresPool, pgQuery } from "@lanza/db";
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

async function pingPostgres(): Promise<{ ok: boolean; error?: string }> {
  try {
    const vercelPool = getVercelPostgresPool();
    if (vercelPool) {
      await vercelPool.query("SELECT 1");
      return { ok: true };
    }
    await pgQuery("SELECT 1");
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
