import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DATABASE_DIR, getDbBackend, pgQuery, REPO_ROOT } from "@lanza/db";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type UserPublic = Pick<UserRecord, "id" | "email" | "name" | "createdAt">;

type UsersFile = {
  users: UserRecord[];
};

const USERS_FILE = path.join(DATABASE_DIR, "users.json");

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublic(user: UserRecord): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

function postgresAvailable(): boolean {
  return getDbBackend() !== "file";
}

async function postgresReachable(): Promise<boolean> {
  if (!postgresAvailable()) return false;
  try {
    await pgQuery("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

function readUsersFile(): UsersFile {
  if (!fs.existsSync(USERS_FILE)) {
    return { users: [] };
  }
  const raw = fs.readFileSync(USERS_FILE, "utf8");
  if (!raw.trim()) return { users: [] };
  return JSON.parse(raw) as UsersFile;
}

function writeUsersFile(data: UsersFile): void {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function rowToUser(row: {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date | string;
}): UserRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.created_at).toISOString(),
  };
}

export async function countUsers(): Promise<number> {
  if (await postgresReachable()) {
    const result = await pgQuery<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM lanza.users",
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }
  return readUsersFile().users.length;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = normalizeEmail(email);
  if (await postgresReachable()) {
    const result = await pgQuery<{
      id: string;
      email: string;
      password_hash: string;
      name: string;
      created_at: Date;
    }>("SELECT id, email, password_hash, name, created_at FROM lanza.users WHERE lower(email) = $1 LIMIT 1", [
      normalized,
    ]);
    const row = result.rows[0];
    return row ? rowToUser(row) : null;
  }

  const user = readUsersFile().users.find((u) => u.email === normalized);
  return user ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  if (await postgresReachable()) {
    const result = await pgQuery<{
      id: string;
      email: string;
      password_hash: string;
      name: string;
      created_at: Date;
    }>("SELECT id, email, password_hash, name, created_at FROM lanza.users WHERE id = $1 LIMIT 1", [id]);
    const row = result.rows[0];
    return row ? rowToUser(row) : null;
  }

  const user = readUsersFile().users.find((u) => u.id === id);
  return user ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name: string;
}): Promise<UserPublic> {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error("E-mail já registado");
  }

  const now = new Date().toISOString();
  const user: UserRecord = {
    id: randomUUID(),
    email,
    passwordHash: input.passwordHash,
    name: input.name.trim(),
    createdAt: now,
    updatedAt: now,
  };

  if (await postgresReachable()) {
    await pgQuery(
      `INSERT INTO lanza.users (id, email, password_hash, name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.email, user.passwordHash, user.name, user.createdAt, user.updatedAt],
    );
    return toPublic(user);
  }

  const file = readUsersFile();
  file.users.push(user);
  writeUsersFile(file);
  return toPublic(user);
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  const now = new Date().toISOString();

  if (await postgresReachable()) {
    const result = await pgQuery(
      `UPDATE lanza.users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
      [passwordHash, now, userId],
    );
    if ((result.rowCount ?? 0) === 0) {
      throw new Error("Utilizador não encontrado");
    }
    return;
  }

  const file = readUsersFile();
  const user = file.users.find((u) => u.id === userId);
  if (!user) {
    throw new Error("Utilizador não encontrado");
  }
  user.passwordHash = passwordHash;
  user.updatedAt = now;
  writeUsersFile(file);
}

export function toUserPublic(user: UserRecord): UserPublic {
  return toPublic(user);
}

/** Caminho do ficheiro local (útil em logs/dev). */
export function usersStorageHint(): string {
  if (postgresAvailable()) return "postgresql:lanza.users";
  return path.relative(REPO_ROOT, USERS_FILE);
}
