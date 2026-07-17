import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DATABASE_DIR } from "@lanza/db";
import { hashPassword } from "../packages/api/src/services/auth.js";

const USERS_FILE = path.join(DATABASE_DIR, "users.json");

type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type UsersFile = { users: UserRecord[] };

async function main(): Promise<void> {
  const email = "lanza_admin@lanza.local";
  const password = "LocaLanza";
  const name = "lanza_admin";

  process.env.LANZA_DB_BACKEND = "file";

  const file: UsersFile = fs.existsSync(USERS_FILE)
    ? (JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) as UsersFile)
    : { users: [] };

  const normalized = email.toLowerCase();
  const existing = file.users.find((u) => u.email === normalized);
  if (existing) {
    console.log(`Utilizador já existe: ${existing.email} (${existing.id})`);
    return;
  }

  const now = new Date().toISOString();
  const user: UserRecord = {
    id: randomUUID(),
    email: normalized,
    passwordHash: await hashPassword(password),
    name,
    createdAt: now,
    updatedAt: now,
  };

  file.users.push(user);
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  console.log("Utilizador criado em database/users.json:");
  console.log(`  E-mail: ${user.email}`);
  console.log(`  Senha:  ${password}`);
  console.log(`  Nome:   ${user.name}`);
  console.log(`  ID:     ${user.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
