import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { IncomingMessage } from "node:http";

import { allowPublicRegister, jwtExpiresIn, jwtSecret } from "../config.js";
import { HttpError } from "../http.js";
import {
  countUsers,
  createUser,
  findUserByEmail,
  findUserById,
  toUserPublic,
  type UserPublic,
  type UserRecord,
} from "./users.js";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function scryptDerive(
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export type AuthTokenPayload = {
  sub: string;
  email: string;
  name: string;
};

export type AuthSession = AuthTokenPayload & {
  user: UserPublic;
};

function secretKey(): Uint8Array {
  const secret = jwtSecret();
  if (!secret) {
    throw new HttpError(503, "Autenticação por utilizador não configurada (LANZA_JWT_SECRET ausente)");
  }
  return new TextEncoder().encode(secret);
}

function parseDurationMs(raw: string): number {
  const match = /^(\d+)([smhd])$/.exec(raw.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number.parseInt(match[1] ?? "0", 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit ?? "d"] ?? multipliers.d);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptDerive(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number.parseInt(parts[1] ?? "", 10);
  const r = Number.parseInt(parts[2] ?? "", 10);
  const p = Number.parseInt(parts[3] ?? "", 10);
  const salt = parts[4] ?? "";
  const expectedHex = parts[5] ?? "";
  if (!n || !r || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const derived = await scryptDerive(password, salt, expected.length, { N: n, r, p });
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function validateRegisterInput(input: {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}): { email: string; password: string; name: string } {
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "E-mail inválido");
  }
  if (password.length < 8) {
    throw new HttpError(400, "A senha deve ter pelo menos 8 caracteres");
  }
  if (name.length < 2) {
    throw new HttpError(400, "Informe o nome (mínimo 2 caracteres)");
  }

  return { email, password, name };
}

export function validateLoginInput(input: {
  email?: unknown;
  password?: unknown;
}): { email: string; password: string } {
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!email || !password) {
    throw new HttpError(400, "E-mail e senha são obrigatórios");
  }

  return { email, password };
}

export async function canRegister(): Promise<boolean> {
  if (allowPublicRegister()) return true;
  const total = await countUsers();
  return total === 0;
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<{ token: string; user: UserPublic }> {
  if (!jwtSecret()) {
    throw new HttpError(503, "Registo indisponível: defina LANZA_JWT_SECRET no servidor");
  }
  if (!(await canRegister())) {
    throw new HttpError(403, "Registo público desativado. Contacte o administrador.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUser({
    email: input.email,
    passwordHash,
    name: input.name,
  });
  const token = await signToken(user);
  return { token, user };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<{ token: string; user: UserPublic }> {
  if (!jwtSecret()) {
    throw new HttpError(503, "Login indisponível: defina LANZA_JWT_SECRET no servidor");
  }

  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new HttpError(401, "E-mail ou senha incorretos");
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    throw new HttpError(401, "E-mail ou senha incorretos");
  }

  const token = await signToken(user);
  return { token, user: toUserPublic(user) };
}

async function signToken(user: UserPublic | UserRecord): Promise<string> {
  const expiresIn = jwtExpiresIn();
  const ms = parseDurationMs(expiresIn);
  const exp = Math.floor((Date.now() + ms) / 1000);

  return new SignJWT({
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(secretKey());
}

export function extractBearerToken(req: IncomingMessage): string | null {
  const header = String(req.headers.authorization ?? "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

export async function verifyAccessToken(token: string): Promise<AuthTokenPayload | null> {
  const secret = jwtSecret();
  if (!secret) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const name = typeof payload.name === "string" ? payload.name : "";
    if (!sub) return null;
    return { sub, email, name };
  } catch {
    return null;
  }
}

export async function resolveSessionFromRequest(
  req: IncomingMessage,
): Promise<AuthSession | null> {
  const token = extractBearerToken(req);
  if (!token) return null;

  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const user = await findUserById(payload.sub);
  if (!user) return null;

  return {
    sub: user.id,
    email: user.email,
    name: user.name,
    user: toUserPublic(user),
  };
}

export async function getSessionUser(req: IncomingMessage): Promise<UserPublic | null> {
  const session = await resolveSessionFromRequest(req);
  return session?.user ?? null;
}
