/**
 * Lança no Rastreame os gastos semanais (OUTROS) para contratos ativos numa semana,
 * evitando duplicado (mesmo info + motorista + rastreável).
 *
 * Uso (raiz do repo):
 *   npx tsx src/run.ts rastreame-lancar-semanal --inicio 2026-06-29 --fim 2026-07-05 [--prazo-dias 90]
 *   npx tsx src/run.ts rastreame-lancar-semanal ... --execute
 *   (Sem `--info` / `--data-iso`, deriva a segunda da semana do `--inicio` e 23:59 America/Recife.)
 *
 * Requer RASTREAME_AUTH ou RASTREAME_LOGIN+RASTREAME_SENHA (ver `.cursor/tools/rastreame/`).
 */
import fs from "node:fs";
import path from "node:path";

import { listarContratosAtivosNaSemana } from "../lib/contratosAtivosSemana.js";
import { docxPlainText, extrairValorSemanalReais } from "../lib/docxPlain.js";
import { defaultContratosDir } from "../lib/lanzaPaths.js";
import { postGasto, fetchGastosList } from "../lib/rastreame/gasto.js";
import { listMotoristas, type Motorista } from "../lib/rastreame/motorista.js";
import { listRastreaveis, type Rastreavel } from "../lib/rastreame/rastreavel.js";
import { REPO_ROOT } from "../lib/repoRoot.js";

/** Segunda-feira da mesma semana civil (domingo = fim de semana anterior). */
function mondayOnOrBefore(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const dow = x.getDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + delta);
  return x;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `info` + `data` alinhados à segunda da semana do `--inicio` (23:59 America/Recife). */
function infoEDataPadraoParaSemana(inicio: Date): { info: string; dataIso: string } {
  const seg = mondayOnOrBefore(inicio);
  const y = seg.getFullYear();
  const m = seg.getMonth() + 1;
  const day = seg.getDate();
  const dataIso = new Date(
    `${y}-${pad2(m)}-${pad2(day)}T23:59:00-03:00`,
  ).toISOString();
  return {
    info: `ATRASADO - Pagamento semanal - Segunda ${day}`,
    dataIso,
  };
}

type Veiculo = { placa: string; marcaModelo: string; anoModelo: string };

function loadVeiculos(): Veiculo[] {
  const p = path.join(REPO_ROOT, "database", "veiculos.json");
  const j = JSON.parse(fs.readFileSync(p, "utf8")) as { veiculos: Veiculo[] };
  return j.veiculos ?? [];
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickVeiculo(pastaVeiculo: string, veiculos: Veiculo[]): Veiculo | null {
  const part =
    pastaVeiculo.split(/\s*-\s*/).slice(1).join(" - ").trim() || pastaVeiculo;
  const partU = part.toUpperCase();
  let best: Veiculo | null = null;
  let bestScore = 0;
  for (const v of veiculos) {
    const mm = `${v.marcaModelo} ${v.anoModelo}`.toUpperCase();
    const tokens = partU.split(/[^A-Z0-9/]+/).filter((t) => t.length >= 2);
    let sc = 0;
    for (const t of tokens) {
      if (mm.includes(t)) sc++;
    }
    if (sc > bestScore) {
      bestScore = sc;
      best = v;
    }
  }
  return bestScore >= 2 ? best : null;
}

function pickMotorista(nomeCliente: string, motoristas: Motorista[]): Motorista | null {
  const c = norm(nomeCliente);
  for (const m of motoristas) {
    const n = norm(String(m.nome ?? ""));
    if (!n) continue;
    if (c.includes(n) || n.includes(c)) return m;
  }
  const cTokens = new Set(
    c.split(/[^a-z0-9]+/).filter((t) => t.length >= 3),
  );
  let best: Motorista | null = null;
  let bestSc = 0;
  for (const m of motoristas) {
    const n = norm(String(m.nome ?? ""));
    let sc = 0;
    for (const t of n.split(/[^a-z0-9]+/).filter((x) => x.length >= 3)) {
      if (cTokens.has(t)) sc++;
    }
    if (sc > bestSc) {
      bestSc = sc;
      best = m;
    }
  }
  return bestSc >= 2 ? best : null;
}

function placaCompacta(placa: string): string {
  return placa.replace(/-/g, "").toUpperCase();
}

function pickRastreavel(placa: string, lista: Rastreavel[]): Rastreavel | null {
  const c = placaCompacta(placa);
  for (const r of lista) {
    const v = String(r.value ?? "").toUpperCase().replace(/-/g, "");
    if (v.includes(c)) return r;
  }
  return null;
}

type GastoRow = {
  info?: string;
  motorista?: { key?: string; id?: string | number };
  rastreavel?: { key?: string; id?: string | number };
};

async function fetchAllGastosPages(): Promise<GastoRow[]> {
  const all: GastoRow[] = [];
  let page = 0;
  const size = 100;
  for (;;) {
    const r = await fetchGastosList({ page, size });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`gastos list HTTP ${r.status}: ${t.slice(0, 300)}`);
    }
    const d = (await r.json()) as { content?: GastoRow[] };
    const chunk = d.content ?? [];
    all.push(...chunk);
    if (chunk.length < size) break;
    page++;
    if (page > 500) break;
  }
  return all;
}

function refKey(
  ref: { key?: string; id?: string | number } | undefined,
): string {
  return String(ref?.key ?? ref?.id ?? "");
}

function jaExisteDuplicado(
  gastos: GastoRow[],
  motoristaKey: string,
  rastreavelKey: string,
  info: string,
): boolean {
  for (const g of gastos) {
    const mk = refKey(g.motorista);
    const rk = refKey(g.rastreavel);
    const inf = String(g.info ?? "").trim();
    if (mk === motoristaKey && rk === rastreavelKey && inf === info) return true;
  }
  return false;
}

function parseArgs(argv: string[]): {
  inicio: Date;
  fim: Date;
  prazoDias: number;
  execute: boolean;
  info: string;
  dataIso: string;
} {
  let inicioS = "2026-06-22";
  let fimS = "2026-06-28";
  let prazoDias = 90;
  let execute = false;
  let infoOverride: string | undefined;
  let dataIsoOverride: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--inicio" && argv[i + 1]) inicioS = argv[++i]!;
    else if (a === "--fim" && argv[i + 1]) fimS = argv[++i]!;
    else if (a === "--prazo-dias" && argv[i + 1])
      prazoDias = Number(argv[++i]!);
    else if (a === "--execute") execute = true;
    else if (a === "--info" && argv[i + 1]) infoOverride = argv[++i]!;
    else if (a === "--data-iso" && argv[i + 1]) dataIsoOverride = argv[++i]!;
  }
  const inicio = new Date(inicioS + "T12:00:00");
  const fim = new Date(fimS + "T12:00:00");
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    console.error("Datas inválidas");
    process.exit(2);
  }
  const derived = infoEDataPadraoParaSemana(inicio);
  const info = infoOverride ?? derived.info;
  const dataIso = dataIsoOverride ?? derived.dataIso;
  return { inicio, fim, prazoDias, execute, info, dataIso };
}

export async function main(argv: string[]): Promise<void> {
  const { inicio, fim, prazoDias, execute, info, dataIso } = parseArgs(argv);
  const root = defaultContratosDir();
  const candidatos = listarContratosAtivosNaSemana(root, inicio, fim, prazoDias);
  const veiculos = loadVeiculos();

  console.log(`contratosDir: ${root}`);
  console.log(
    `Semana ${inicio.toISOString().slice(0, 10)}–${fim.toISOString().slice(0, 10)} | prazo ${prazoDias}d | candidatos: ${candidatos.length}`,
  );
  console.log(`info: "${info}" | data: ${dataIso}`);
  console.log(execute ? "MODO: EXECUTAR POST" : "MODO: dry-run (use --execute)");

  let gastos: GastoRow[] = [];
  let motoristas: Motorista[] = [];
  let rastreaveis: Rastreavel[] = [];

  try {
    motoristas = await listMotoristas();
    rastreaveis = await listRastreaveis();
    gastos = await fetchAllGastosPages();
    console.log(
      `API: ${motoristas.length} motoristas, ${rastreaveis.length} rastreáveis, ${gastos.length} gastos (páginas).`,
    );
  } catch (e) {
    console.error(
      "Falha ao falar com a API Rastreame. Defina RASTREAME_AUTH ou RASTREAME_LOGIN+RASTREAME_SENHA.",
    );
    console.error(e);
    process.exit(2);
  }

  let ok = 0;
  let skipDup = 0;
  let skipDados = 0;

  for (const c of candidatos) {
    let texto = "";
    try {
      texto = docxPlainText(c.docx);
    } catch (e) {
      console.error(`[erro docx] ${c.docx}`, e);
      skipDados++;
      continue;
    }
    const valor = extrairValorSemanalReais(texto);
    const v = pickVeiculo(c.pastaVeiculo, veiculos);
    const m = pickMotorista(c.clienteNome, motoristas);
    const r = v ? pickRastreavel(v.placa, rastreaveis) : null;

    const mk = m?.id ?? m?.key;
    const rk = r?.key;
    const motoristaKey = mk !== undefined && mk !== null ? String(mk) : "";
    const rastreavelKey = rk !== undefined && rk !== null ? String(rk) : "";

    if (!valor || !motoristaKey || !rastreavelKey) {
      console.log(
        `[SKIP dados] ${c.clienteNome} | veículo pasta: ${c.pastaVeiculo} | valor=${valor ?? "?"} | motoristaKey=${motoristaKey || "?"} | rastreavelKey=${rastreavelKey || "?"} | placa?=${v?.placa ?? "?"}`,
      );
      skipDados++;
      continue;
    }

    if (jaExisteDuplicado(gastos, motoristaKey, rastreavelKey, info)) {
      console.log(
        `[SKIP duplicado] ${c.clienteNome} + ${v!.placa} | já existe gasto com mesmo info/keys.`,
      );
      skipDup++;
      continue;
    }

    const body = {
      total: valor,
      info,
      tipo: { key: "OUTROS" },
      rastreavel: { key: rastreavelKey },
      motorista: { key: motoristaKey },
      data: dataIso,
    };

    console.log(
      `[POST?] ${c.clienteNome} | ${v!.placa} | R$ ${valor} | motorista=${motoristaKey} rastreavel=${rastreavelKey}`,
    );

    if (execute) {
      const res = await postGasto(body);
      const t = await res.text();
      if (!res.ok) {
        console.error(`ERRO HTTP ${res.status}:`, t.slice(0, 400));
        skipDados++;
      } else {
        ok++;
        gastos.push({
          info,
          motorista: { key: motoristaKey },
          rastreavel: { key: rastreavelKey },
        });
      }
    }
  }

  console.log(
    `\nResumo: criados=${ok} | duplicados=${skipDup} | falta dados/erro=${skipDados} | dry-run=${!execute}`,
  );
}
