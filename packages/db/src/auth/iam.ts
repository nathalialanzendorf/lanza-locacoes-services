import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { Signer } from "@aws-sdk/rds-signer";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";

import type { PgConfig } from "../config.js";

/** Erro de configuração de autenticação (mensagem orientada ao operador). */
export class PgAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PgAuthError";
  }
}

function isVercelOidcRole(arn?: string): boolean {
  return !!arn && /\/Vercel\//i.test(arn);
}

async function probeAwsCredentials(): Promise<boolean> {
  try {
    const creds = await defaultProvider()();
    return !!(creds.accessKeyId && creds.secretAccessKey);
  } catch {
    return false;
  }
}

function localAuthHelp(): string {
  return (
    "Autenticação PostgreSQL local indisponível.\n" +
    "  A role AWS_ROLE_ARN (Vercel OIDC) só funciona na Vercel — não na máquina local.\n" +
    "  Opção A — senha RDS (recomendado):\n" +
    "            .\\scripts\\set-postgres-user-env.ps1 -PromptPassword\n" +
    "            .\\scripts\\set-postgres-user-env.ps1 -Password \"<senha>\"\n" +
    "  Opção B — AWS CLI + perfil IAM com rds-db:connect (sem assumir a role Vercel):\n" +
    "            instale AWS CLI, configure credenciais e remova AWS_ROLE_ARN do ambiente local."
  );
}

/** Credenciais para o RDS Signer (local/CLI). */
async function resolveSignerCredentials(config: PgConfig) {
  const onVercel = !!process.env.VERCEL;
  const roleArn = config.awsRoleArn;

  if (roleArn && !onVercel && isVercelOidcRole(roleArn)) {
    const hasCreds = await probeAwsCredentials();
    if (!hasCreds) throw new PgAuthError(localAuthHelp());
    // Role Vercel não é assumível localmente; usa credenciais diretas (IAM user com rds-db:connect).
    return defaultProvider();
  }

  if (roleArn) {
    return fromTemporaryCredentials({
      params: {
        RoleArn: roleArn,
        RoleSessionName: "lanza-postgres",
      },
      masterCredentials: defaultProvider(),
    });
  }

  const hasCreds = await probeAwsCredentials();
  if (!hasCreds) throw new PgAuthError(localAuthHelp());
  return defaultProvider();
}

/** Gera token IAM para autenticação no RDS (válido ~15 min). */
export async function getRdsIamAuthToken(config: PgConfig): Promise<string> {
  const region = config.awsRegion ?? "us-east-1";
  const credentials = await resolveSignerCredentials(config);
  const signer = new Signer({
    hostname: config.host,
    port: config.port,
    username: config.user,
    region,
    credentials,
  });
  return signer.getAuthToken();
}

/** Senha estática ou token IAM, conforme disponível. */
export async function resolvePgPassword(config: PgConfig): Promise<string> {
  if (config.password) return config.password;
  return getRdsIamAuthToken(config);
}
