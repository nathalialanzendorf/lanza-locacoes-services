/** Gravação bloqueada na Vercel/Lambda com backend `file` (JSON embebido é read-only). */
export class ReadOnlyBackendError extends Error {
  constructor(message?: string) {
    super(
      message ??
        "Gravação indisponível: backend file em ambiente serverless (somente leitura). " +
          "Configure na Vercel LANZA_DB_BACKEND=postgres, PGHOST, AWS_ROLE_ARN e faça redeploy " +
          "(scripts/set-vercel-postgres-env.ps1).",
    );
    this.name = "ReadOnlyBackendError";
  }
}
