/**
 * Cadastra veículos de estoque venda via POST /api/veiculos (Postgres produção).
 *
 * Uso:
 *   npx tsx scripts/cadastrar-veiculos-venda-api.ts
 *   npx tsx scripts/cadastrar-veiculos-venda-api.ts --base http://127.0.0.1:3100
 *
 * Autenticação (uma das opções):
 *   LANZA_API_KEY=... npx tsx scripts/cadastrar-veiculos-venda-api.ts
 *   LANZA_BEARER_TOKEN=... npx tsx scripts/cadastrar-veiculos-venda-api.ts
 *   npx tsx scripts/cadastrar-veiculos-venda-api.ts --email ... --password ...
 */
import { formatPlacaHyphen } from "../src/lib/placa.js";

const DEFAULT_BASE = "https://api.lanzalocacoes.vercel.app";
const DEFAULT_EMAIL = "lanza.locacoes@gmail.com";
const DEFAULT_PASSWORD = "LocaLanza";

type VeiculoVendaInput = {
  dono: string;
  placa: string;
  marca: string;
  modelo: string;
  anoModelo: string;
  renavam: string;
  documento: string;
  cor?: string;
};

const VEICULOS: VeiculoVendaInput[] = [
  {
    dono: "Ramon",
    placa: "IOK3H21",
    marca: "Chevrolet",
    modelo: "Montana 1.4",
    cor: "Vermelha",
    anoModelo: "2008/2008",
    renavam: "00948255250",
    documento: "43051371000105",
  },
  {
    dono: "Ricardo",
    placa: "MKB8D01",
    marca: "Volkswagen",
    modelo: "Gol 1.0 GIV",
    cor: "Branca",
    anoModelo: "2012/2013",
    renavam: "454027109",
    documento: "04062432552",
  },
  {
    dono: "Venezuelano",
    placa: "MBI0664",
    marca: "GM",
    modelo: "CORSA MILENIUM",
    anoModelo: "2001/2001",
    renavam: "762434040",
    documento: "06598411939",
  },
  {
    dono: "Elton",
    placa: "AJZ1G60",
    marca: "FIAT",
    modelo: "PALIO WEEKEND ELX",
    anoModelo: "2001/2002",
    renavam: "762122676",
    documento: "68283440900",
  },
  {
    dono: "Bruno",
    placa: "NRH5E75",
    marca: "HYUNDAI",
    modelo: "i30 2.0",
    anoModelo: "2011/2012",
    renavam: "373630310",
    documento: "10562102906",
  },
  {
    dono: "Felipe",
    placa: "OWN3C59",
    marca: "Renault",
    modelo: "Sandero Exp 1.0",
    anoModelo: "2013/2014",
    renavam: "00597756635",
    documento: "52318451915",
  },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

function anoDeAnoModelo(anoModelo: string): number | undefined {
  const m = anoModelo.match(/\/(\d{4})$/);
  return m ? Number(m[1]) : undefined;
}

function bodyFromInput(v: VeiculoVendaInput): Record<string, unknown> {
  const placa = formatPlacaHyphen(v.placa);
  const body: Record<string, unknown> = {
    placa,
    marca: v.marca,
    modelo: v.modelo,
    marcaModelo: `${v.marca}/${v.modelo}`.replace(/\s+/g, " ").trim(),
    anoModelo: v.anoModelo,
    ano: anoDeAnoModelo(v.anoModelo),
    renavam: v.renavam,
    tipoFrota: "venda",
    ativo: true,
    origem: "import-venda-estoque",
    proprietarioNome: v.dono,
    proprietarioDocumento: v.documento,
    rastreameLabel: `${v.dono} — ${v.documento}`,
    clienteVinculadoId: null,
  };
  if (v.cor?.trim()) body.cor = v.cor.trim();
  return body;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const apiKey = process.env.LANZA_API_KEY?.trim() || arg("--api-key");
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
    return headers;
  }
  const bearer = bearerToken;
  if (bearer) {
    headers.Authorization = `Bearer ${bearer}`;
    return headers;
  }
  throw new Error(
    "Defina LANZA_API_KEY ou LANZA_BEARER_TOKEN (ou --api-key / --token / --email --password) para autenticar na API.",
  );
}

let bearerToken =
  process.env.LANZA_BEARER_TOKEN?.trim() || arg("--token") || "";

async function fetchJson(
  base: string,
  path: string,
  init: RequestInit & { auth?: boolean } = {},
): Promise<{ status: number; json: unknown }> {
  const headers = { ...(init.headers as Record<string, string> | undefined) };
  if (init.auth !== false) {
    Object.assign(headers, authHeaders());
  }
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function ensureBearerToken(base: string): Promise<void> {
  if (bearerToken) return;
  const apiKey = process.env.LANZA_API_KEY?.trim() || arg("--api-key");
  if (apiKey) return;

  const email = arg("--email") || process.env.LANZA_ADMIN_EMAIL?.trim() || DEFAULT_EMAIL;
  const password =
    arg("--password") || process.env.LANZA_ADMIN_PASSWORD?.trim() || DEFAULT_PASSWORD;

  const login = await fetchJson(base, "/api/auth/login", {
    method: "POST",
    auth: false,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (login.status === 200 && login.json && typeof login.json === "object") {
    const token = (login.json as { token?: string }).token?.trim();
    if (token) {
      bearerToken = token;
      return;
    }
  }

  const register = await fetchJson(base, "/api/auth/register", {
    method: "POST",
    auth: false,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: "Lanza ADMIN" }),
  });

  if (register.status === 201 || register.status === 200) {
    const token = (register.json as { token?: string }).token?.trim();
    if (token) {
      bearerToken = token;
      return;
    }
  }

  const login2 = await fetchJson(base, "/api/auth/login", {
    method: "POST",
    auth: false,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const token2 = (login2.json as { token?: string }).token?.trim();
  if (login2.status === 200 && token2) {
    bearerToken = token2;
    return;
  }

  throw new Error(
    "Falha ao autenticar — use LANZA_API_KEY, token válido ou credenciais de login corretas.",
  );
}

async function apiPost(base: string, path: string, body: unknown): Promise<unknown> {
  const { status, json } = await fetchJson(base, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!status || status >= 400) {
    const err =
      json && typeof json === "object" && "error" in json
        ? String((json as { error: unknown }).error)
        : JSON.stringify(json).slice(0, 500);
    throw new Error(`HTTP ${status} ${path}: ${err}`);
  }
  return json;
}

async function main(): Promise<void> {
  const base = arg("--base") || process.env.LANZA_API_BASE?.trim() || DEFAULT_BASE;
  await ensureBearerToken(base);
  const resultados: Array<{ placa: string; acao: string; id?: string; dono: string }> = [];

  for (const v of VEICULOS) {
    const body = bodyFromInput(v);
    const placa = String(body.placa);
    try {
      const r = (await apiPost(base, "/api/veiculos", body)) as {
        data?: { id?: string };
        acao?: string;
      };
      resultados.push({
        placa,
        acao: r.acao ?? "ok",
        id: r.data?.id,
        dono: v.dono,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultados.push({ placa, acao: `erro: ${msg}`, dono: v.dono });
    }
  }

  console.log(JSON.stringify({ base, total: resultados.length, veiculos: resultados }, null, 2));
  const falhas = resultados.filter((r) => r.acao.startsWith("erro"));
  if (falhas.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
