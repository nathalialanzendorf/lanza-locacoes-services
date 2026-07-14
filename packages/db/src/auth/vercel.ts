import { Signer } from "@aws-sdk/rds-signer";

import type { PgConfig } from "../config.js";

import type { AwsCredentialIdentityProvider } from "@smithy/types";

type VercelOidcModule = {
  awsCredentialsProvider: (opts: {
    roleArn: string;
    clientConfig?: { region?: string };
  }) => AwsCredentialIdentityProvider;
};

type VercelFunctionsModule = {
  attachDatabasePool: (pool: import("pg").Pool) => void;
};

/**
 * Cria pool PostgreSQL para deploy na Vercel com OIDC + RDS IAM.
 * Requer peer deps: `@vercel/oidc-aws-credentials-provider` e `@vercel/functions`.
 */
export async function createVercelPostgresPool(
  config?: Partial<PgConfig>,
): Promise<import("pg").Pool> {
  const { Pool } = await import("pg");
  const { getPgConfig, pgSslOptions } = await import("../config.js");

  const pg = { ...getPgConfig(), ...config };
  const region = pg.awsRegion ?? "us-east-1";
  const roleArn = pg.awsRoleArn;

  if (!roleArn) {
    throw new Error(
      "createVercelPostgresPool requer AWS_ROLE_ARN (autenticação OIDC na Vercel).",
    );
  }

  let oidc: VercelOidcModule;
  let vercelFns: VercelFunctionsModule;
  try {
    oidc = (await import("@vercel/oidc-aws-credentials-provider")) as VercelOidcModule;
    vercelFns = (await import("@vercel/functions")) as VercelFunctionsModule;
  } catch {
    throw new Error(
      "Peer dependencies em falta para Vercel: instale @vercel/oidc-aws-credentials-provider e @vercel/functions.",
    );
  }

  const signer = new Signer({
    hostname: pg.host,
    port: pg.port,
    username: pg.user,
    region,
    credentials: oidc.awsCredentialsProvider({
      roleArn,
      clientConfig: { region },
    }),
  });

  const pool = new Pool({
    host: pg.host,
    user: pg.user,
    database: pg.database,
    password: () => signer.getAuthToken(),
    port: pg.port,
    ssl: pgSslOptions(pg.sslMode),
  });

  vercelFns.attachDatabasePool(pool);
  return pool;
}
