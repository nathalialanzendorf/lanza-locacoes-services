/// <reference path="../types/vercel-peers.d.ts" />
import { Signer } from "@aws-sdk/rds-signer";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { attachDatabasePool } from "@vercel/functions";
import pg from "pg";

import { getPgConfig, pgSslOptions, type PgConfig } from "../config.js";

const { Pool } = pg;

/**
 * Pool PostgreSQL na Vercel — OIDC + RDS IAM (padrão Vercel/AWS).
 * Requer `@vercel/oidc-aws-credentials-provider`, `@vercel/functions` e `AWS_ROLE_ARN`.
 */
export function createVercelPostgresPool(config?: Partial<PgConfig>): pg.Pool {
  const pgConfig = { ...getPgConfig(), ...config };
  const region = pgConfig.awsRegion ?? "us-east-1";
  const roleArn = pgConfig.awsRoleArn;

  if (!roleArn) {
    throw new Error(
      "createVercelPostgresPool requer AWS_ROLE_ARN (autenticação OIDC na Vercel).",
    );
  }

  const signer = new Signer({
    hostname: pgConfig.host,
    port: pgConfig.port,
    username: pgConfig.user,
    region,
    credentials: awsCredentialsProvider({
      roleArn,
      clientConfig: { region },
    }),
  });

  const pool = new Pool({
    host: pgConfig.host,
    user: pgConfig.user,
    database: pgConfig.database,
    password: () => signer.getAuthToken(),
    port: pgConfig.port,
    ssl: pgSslOptions(pgConfig.sslMode) ?? { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 5,
  });

  try {
    attachDatabasePool(pool);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[lanza/db] attachDatabasePool ignorado:", msg);
  }
  return pool;
}
