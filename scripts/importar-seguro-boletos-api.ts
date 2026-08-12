/**
 * Extrai boletos de seguro de uma pasta local e grava via POST /api/parceiro-despesas.
 *
 * Uso:
 *   npx tsx scripts/importar-seguro-boletos-api.ts --scan "D:/Dropbox/.../08 Agosto"
 *   npx tsx scripts/importar-seguro-boletos-api.ts --mes 08 --ano 2026
 */
import path from "node:path";
import fs from "node:fs";

import {
  defaultSeguroComprovantesDirs,
  extrairSeguroComprovantesDirs,
} from "../src/lib/extrairSeguroComprovante.js";
import { readLanzaPaths } from "../src/lib/lanzaPaths.js";

const DEFAULT_BASE = "https://api.lanzalocacoes.vercel.app";
const DEFAULT_EMAIL = "lanza.locacoes@gmail.com";
const DEFAULT_PASSWORD = "LocaLanza";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1]?.trim() : undefined;
}

let bearerToken = process.env.LANZA_BEARER_TOKEN?.trim() || arg("--token") || "";

function authHeaders(): Record<string, string> {
  const apiKey = process.env.LANZA_API_KEY?.trim() || arg("--api-key");
  if (apiKey) return { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": apiKey };
  if (bearerToken) {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
    };
  }
  throw new Error("Autenticação ausente (LANZA_API_KEY, LANZA_BEARER_TOKEN ou --email/--password).");
}

async function ensureBearerToken(base: string): Promise<void> {
  if (bearerToken || process.env.LANZA_API_KEY?.trim() || arg("--api-key")) return;
  const email = arg("--email") || process.env.LANZA_ADMIN_EMAIL?.trim() || DEFAULT_EMAIL;
  const password =
    arg("--password") || process.env.LANZA_ADMIN_PASSWORD?.trim() || DEFAULT_PASSWORD;

  for (const path of ["/api/auth/login", "/api/auth/register"]) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Lanza ADMIN" }),
    });
    const json = (await res.json().catch(() => ({}))) as { token?: string };
    if (json.token?.trim()) {
      bearerToken = json.token.trim();
      return;
    }
  }
  throw new Error("Falha ao autenticar na API.");
}

function resolveScanDirs(): string[] {
  const scans: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === "--scan" && process.argv[i + 1]) {
      scans.push(path.resolve(process.argv[++i]!));
    }
  }
  if (scans.length) return scans;

  const mes = arg("--mes") || "08";
  const ano = arg("--ano") || String(new Date().getFullYear());
  const cfg = readLanzaPaths();
  const base = cfg.seguroComprovantesDir
    ? path.dirname(cfg.seguroComprovantesDir)
    : path.join(cfg.documentosRaiz || "", "Proteção Veicular", "Comprovantes");
  const anoDir = path.join(base, ano);

  const mesLower = mes.toLowerCase();
  const mesNum = mes.padStart(2, "0");
  const nomesMes = [
    `${mesNum} Agosto`,
    `${mesNum} agosto`,
    `${mesNum} AGOSTO`,
    `${mesNum} Agosto`,
  ];
  if (mesNum === "08") {
    nomesMes.push("08 Agosto", "08 agosto");
  }

  const candidatos = nomesMes.map((n) => path.join(anoDir, n));
  for (const c of candidatos) {
    if (fs.existsSync(c)) return [c];
  }

  return defaultSeguroComprovantesDirs([ano]);
}

async function importarBoleto(
  base: string,
  b: { placa: string; valor: number; data: string; competencia: string; origem: string },
): Promise<{ placa: string; acao: string; erro?: string }> {
  const res = await fetch(`${base}/api/parceiro-despesas`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      placa: b.placa,
      categoria: "Seguro",
      descricao: "Seguro",
      data: b.data,
      valor: b.valor,
      competencia: b.competencia,
      origem: b.origem,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    acao?: string;
    data?: { placa?: string };
    error?: string;
  };
  if (!res.ok) {
    return {
      placa: b.placa,
      acao: "erro",
      erro: json.error || `HTTP ${res.status}`,
    };
  }
  return { placa: b.placa, acao: json.acao ?? "ok" };
}

async function main(): Promise<void> {
  const base = arg("--base") || process.env.LANZA_API_BASE?.trim() || DEFAULT_BASE;
  await ensureBearerToken(base);

  const scanDirs = resolveScanDirs();
  const { boletos, erros } = await extrairSeguroComprovantesDirs(scanDirs);

  const mesFiltro = arg("--competencia") || arg("--mes");
  const filtrados =
    mesFiltro && mesFiltro.length <= 2
      ? boletos.filter((b) => b.competencia.startsWith(`${mesFiltro.padStart(2, "0")}/`))
      : mesFiltro
        ? boletos.filter((b) => b.competencia === mesFiltro)
        : boletos;

  const resultados: Array<{ placa: string; acao: string; competencia?: string; erro?: string }> = [];
  for (const b of filtrados) {
    const r = await importarBoleto(base, b);
    resultados.push({ ...r, competencia: b.competencia });
  }

  console.log(
    JSON.stringify(
      {
        base,
        pastas: scanDirs,
        extraidos: boletos.length,
        importados: filtrados.length,
        errosExtracao: erros.length,
        resultados,
        avisosExtracao: erros.slice(0, 10),
      },
      null,
      2,
    ),
  );

  const falhas = resultados.filter((r) => r.acao === "erro");
  if (falhas.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
