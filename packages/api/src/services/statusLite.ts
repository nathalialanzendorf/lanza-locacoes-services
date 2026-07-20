import { API_VERSION, apiPublicUrl } from "../config.js";
import { getDbBackend } from "@lanza/db";

/** Resposta mínima de /health — sem lib-imports nem ping Postgres (cold start). */
export function obterStatusLite(): {
  status: "ok";
  service: string;
  version: string;
  apiUrl?: string;
  database: { backend: string };
  git?: { commitSha?: string; ref?: string };
} {
  return {
    status: "ok",
    service: "@lanza/api",
    version: API_VERSION,
    apiUrl: apiPublicUrl(),
    database: { backend: getDbBackend() },
    git: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || undefined,
      ref: process.env.VERCEL_GIT_COMMIT_REF?.trim() || undefined,
    },
  };
}
