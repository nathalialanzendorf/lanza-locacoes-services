import { Signer } from "@aws-sdk/rds-signer";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import type { PgConfig } from "../config.js";

/** Gera token IAM para autenticação no RDS (válido ~15 min). */
export async function getRdsIamAuthToken(config: PgConfig): Promise<string> {
  const region = config.awsRegion ?? "us-east-1";
  const signer = new Signer({
    hostname: config.host,
    port: config.port,
    username: config.user,
    region,
    credentials: config.awsRoleArn
      ? fromTemporaryCredentials({
          params: {
            RoleArn: config.awsRoleArn,
            RoleSessionName: "lanza-postgres",
          },
        })
      : undefined,
  });
  return signer.getAuthToken();
}

/** Senha estática ou token IAM, conforme disponível. */
export async function resolvePgPassword(config: PgConfig): Promise<string> {
  if (config.password) return config.password;
  return getRdsIamAuthToken(config);
}
