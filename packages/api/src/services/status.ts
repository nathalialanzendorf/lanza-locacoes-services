import { API_VERSION, apiPublicUrl } from "../config.js";
import { getDbBackend, getVercelPostgresPool, pgQuery } from "@lanza/db";

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
  };
}
