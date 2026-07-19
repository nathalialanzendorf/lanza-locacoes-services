/**
 * Cria (ou repõe a senha de) um utilizador admin no PostgreSQL (lanza.users).
 *
 * Uso:
 *   npx tsx scripts/create-postgres-admin-user.ts
 *   npx tsx scripts/create-postgres-admin-user.ts --reset
 *   .\scripts\create-admin-user.ps1
 *
 * Pré-requisitos:
 *   - PGHOST/PGPASSWORD (ou DATABASE_URL): .\scripts\set-postgres-user-env.ps1 -PromptPassword
 *   - LANZA_DB_BACKEND=postgres (definido automaticamente por este script)
 */
import { randomUUID } from "node:crypto";

import { closePgPool, getPgConfig, migratePostgres, pgQuery } from "@lanza/db";

import { hashPassword } from "../packages/api/src/services/auth.js";

process.env.LANZA_DB_BACKEND = "postgres";

const DEFAULT_EMAIL = "lanza_admin@lanza.local";
const DEFAULT_PASSWORD = "LocaLanza";
const DEFAULT_NAME = "lanza_admin";

type CliOptions = {
  email: string;
  password: string;
  name: string;
  reset: boolean;
  skipMigrate: boolean;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
};

function parseArgs(argv: string[]): CliOptions {
  let email = DEFAULT_EMAIL;
  let password = DEFAULT_PASSWORD;
  let name = DEFAULT_NAME;
  let reset = false;
  let skipMigrate = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--reset") {
      reset = true;
      continue;
    }
    if (arg === "--skip-migrate") {
      skipMigrate = true;
      continue;
    }
    if (arg === "--email" && argv[i + 1]) {
      email = argv[++i] ?? email;
      continue;
    }
    if (arg === "--password" && argv[i + 1]) {
      password = argv[++i] ?? password;
      continue;
    }
    if (arg === "--name" && argv[i + 1]) {
      name = argv[++i] ?? name;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(`Uso: npx tsx scripts/create-postgres-admin-user.ts [opções]

Cria utilizador admin em PostgreSQL (schema lanza.users).

Opções:
  --email <e-mail>      (default: ${DEFAULT_EMAIL})
  --password <senha>    (default: ${DEFAULT_PASSWORD})
  --name <nome>         (default: ${DEFAULT_NAME})
  --reset               repõe a senha se o e-mail já existir
  --skip-migrate        não executa npm run db:migrate antes
  -h, --help            mostra esta ajuda

Configure Postgres: .\\scripts\\set-postgres-user-env.ps1 -PromptPassword
`);
      process.exit(0);
    }
  }

  return { email, password, name, reset, skipMigrate };
}

async function assertPostgresConnection(): Promise<void> {
  try {
    getPgConfig();
  } catch {
    throw new Error(
      "PostgreSQL não configurado. Defina PGHOST/PGPASSWORD (ou DATABASE_URL).\n" +
        "  .\\scripts\\set-postgres-user-env.ps1 -PromptPassword",
    );
  }

  await pgQuery("SELECT 1");
  const cfg = getPgConfig();
  console.log(`Postgres: ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  const normalized = email.trim().toLowerCase();
  const result = await pgQuery<UserRow>(
    "SELECT id, email, name FROM lanza.users WHERE lower(email) = $1 LIMIT 1",
    [normalized],
  );
  return result.rows[0] ?? null;
}

async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
}): Promise<UserRow> {
  const email = input.email.trim().toLowerCase();
  const now = new Date().toISOString();
  const id = randomUUID();

  await pgQuery(
    `INSERT INTO lanza.users (id, email, password_hash, name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, email, input.passwordHash, input.name.trim(), now, now],
  );

  return { id, email, name: input.name.trim() };
}

async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  const now = new Date().toISOString();
  const result = await pgQuery(
    "UPDATE lanza.users SET password_hash = $1, updated_at = $2 WHERE id = $3",
    [passwordHash, now, userId],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw new Error("Utilizador não encontrado");
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.password.length < 8) {
    throw new Error("A senha deve ter pelo menos 8 caracteres");
  }
  if (opts.name.trim().length < 2) {
    throw new Error("O nome deve ter pelo menos 2 caracteres");
  }

  await assertPostgresConnection();

  if (!opts.skipMigrate) {
    console.log("A aplicar migração do schema (lanza.users)...");
    await migratePostgres({ importJson: false });
  }

  const existing = await findUserByEmail(opts.email);
  if (existing) {
    if (!opts.reset) {
      console.log(`Utilizador já existe no Postgres: ${existing.email} (${existing.id})`);
      console.log("Use --reset ou .\\scripts\\create-admin-user.ps1 -Reset para repor a senha.");
      return;
    }

    const passwordHash = await hashPassword(opts.password);
    await updateUserPassword(existing.id, passwordHash);
    console.log("Senha reposta no PostgreSQL:");
    console.log(`  E-mail: ${existing.email}`);
    console.log(`  Senha:  ${opts.password}`);
    console.log(`  Nome:   ${existing.name}`);
    console.log(`  ID:     ${existing.id}`);
    return;
  }

  const passwordHash = await hashPassword(opts.password);
  const user = await createUser({
    email: opts.email,
    passwordHash,
    name: opts.name,
  });

  console.log("Utilizador admin criado no PostgreSQL:");
  console.log(`  E-mail: ${user.email}`);
  console.log(`  Senha:  ${opts.password}`);
  console.log(`  Nome:   ${user.name}`);
  console.log(`  ID:     ${user.id}`);
  console.log("");
  console.log("Login no painel: use este e-mail e senha (LANZA_JWT_SECRET na API/Vercel).");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => closePgPool());
