import { spawnSync } from "node:child_process";

import {
  buildMotoristaPayload,
  fetchGastoById,
  fetchGastosList,
  fetchMotoristaByKey,
  fetchRastreameToken,
  findMotorista,
  lancarSemanalRastreame,
  listMotoristas,
  loginRastreame,
  postGasto,
  postMotoristaPayload,
  putGasto,
  putMotorista,
  type LancarSemanalRastreameOpts,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

function persistUserEnv(name: string, value: string): boolean {
  if (process.platform !== "win32") return false;
  const ps = `[Environment]::SetEnvironmentVariable('${name}', $env:LANZA_TOKEN_TMP, 'User')`;
  const r = spawnSync(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", ps],
    { env: { ...process.env, LANZA_TOKEN_TMP: value }, stdio: "pipe" },
  );
  return r.status === 0;
}

export async function statusAuthRastreame() {
  const token = await fetchRastreameToken();
  return {
    configurado: Boolean(token),
    loginDisponivel: Boolean(process.env.RASTREAME_LOGIN && process.env.RASTREAME_SENHA),
  };
}

export async function loginRastreameApi(save = false) {
  const token = await loginRastreame();
  if (!token) {
    throw new HttpError(
      401,
      "Login falhou — defina RASTREAME_LOGIN e RASTREAME_SENHA nas variáveis de ambiente",
    );
  }
  let gravado = false;
  if (save) {
    gravado = persistUserEnv("RASTREAME_AUTH", token);
    if (!gravado) {
      throw new HttpError(500, "Token obtido mas não foi possível gravar RASTREAME_AUTH (Windows)");
    }
  }
  return { ok: true, token, gravado };
}

export async function verificarMotoristaRastreame(cnh: string, nome = "") {
  const m = await findMotorista(cnh, nome);
  return {
    cadastrado: m != null,
    motorista: m,
  };
}

export async function listarMotoristasRastreame() {
  const items = await listMotoristas();
  return { total: items.length, items };
}

export async function upsertMotoristaRastreame(body: Record<string, unknown>) {
  const nome = String(body.nome ?? "").trim();
  if (!nome) throw new HttpError(400, 'Campo "nome" é obrigatório');
  const cnh = (body.cnh ?? {}) as Record<string, string>;
  const payload = buildMotoristaPayload(body as Parameters<typeof buildMotoristaPayload>[0]);
  const ja = await findMotorista(cnh.numeroRegistro ?? "", nome);
  if (ja) {
    const key = String(ja.key ?? ja.id ?? "");
    if (!key) {
      return { acao: "ja_cadastrado", motorista: ja };
    }
    const atual = await fetchMotoristaByKey(key);
    await putMotorista(key, { ...atual, ...payload, ativo: true });
    return { acao: "atualizado", key, motorista: { ...atual, ...payload } };
  }
  const created = await postMotoristaPayload(payload);
  return { acao: "criado", motorista: created };
}

export async function listarGastosRastreame(opts?: {
  page?: number;
  size?: number;
  dataInicial?: string;
  dataFinal?: string;
}) {
  const r = await fetchGastosList(opts ?? {});
  const text = await r.text();
  if (!r.ok) {
    throw new HttpError(r.status, `Rastreame gastos: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function obterGastoRastreame(id: string | number) {
  return fetchGastoById(id);
}

export async function criarGastoRastreame(body: unknown) {
  const r = await postGasto(body);
  const text = await r.text();
  if (!r.ok) throw new HttpError(r.status, `Rastreame POST gasto: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function atualizarGastoRastreame(id: string | number, body: unknown) {
  const r = await putGasto(id, body);
  const text = await r.text();
  if (!r.ok) throw new HttpError(r.status, `Rastreame PUT gasto: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

export async function lancarPagamentosSemanais(input: LancarSemanalRastreameOpts) {
  if (!input.inicio || !input.fim) {
    throw new HttpError(400, 'Campos "inicio" e "fim" (YYYY-MM-DD) são obrigatórios');
  }
  try {
    return await lancarSemanalRastreame(input);
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
}
