import { apiRequest } from "./client";
import type {
  AuthLoginResponse,
  AuthMeResponse,
  AuthRegisterBody,
  AuthStatusResponse,
} from "./authTypes";

const TOKEN_KEY = "lanza_auth_token";

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setStoredToken(token: string): void {
  if (token.trim()) {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function logout(): void {
  setStoredToken("");
}

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  return apiRequest<AuthStatusResponse>("/api/auth/status");
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  return apiRequest<AuthMeResponse>("/api/auth/me");
}

export async function login(email: string, password: string): Promise<AuthLoginResponse> {
  const result = await apiRequest<AuthLoginResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setStoredToken(result.token);
  return result;
}

export async function register(body: AuthRegisterBody): Promise<AuthLoginResponse> {
  const result = await apiRequest<AuthLoginResponse>("/api/auth/register", {
    method: "POST",
    body,
  });
  setStoredToken(result.token);
  return result;
}
