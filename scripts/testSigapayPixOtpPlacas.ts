/**
 * Testa se um único OTP SMS do SigaPay PIX serve para várias placas.
 *
 * Fase 1 — solicitar (dispara SMS; pode ser 1 ou N SMS consoante o portal):
 *   npx tsx scripts/testSigapayPixOtpPlacas.ts --phone 48999999999 --solicitar
 *   npx tsx scripts/testSigapayPixOtpPlacas.ts --phone 48999999999 --solicitar --max 5
 *
 * Fase 2 — verificar o mesmo código em todos os ids guardados:
 *   npx tsx scripts/testSigapayPixOtpPlacas.ts --verify --code 62424
 *
 * Tudo numa linha (solicitar 1ª placa + verificar nas restantes com ids novos):
 *   npx tsx scripts/testSigapayPixOtpPlacas.ts --phone 48999999999 --code 62424 --full --max 10
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadPlacasParaSync } from "../src/lib/pedagioDigital/syncPedagios.js";
import { formatPlacaHyphen } from "../src/lib/placa.js";
import {
  solicitarCodigoPixRegularizacao,
  verificarCodigoPixRegularizacao,
} from "../src/lib/sigapay/pixRegularizacao.js";

const OUT_FILE =
  process.env.SIGAPAY_PIX_OTP_TEST_FILE?.trim() ||
  path.join(os.tmpdir(), "sigapay_pix_otp_test.json");

type SolicitacaoGuardada = {
  phone: string;
  placa: string;
  id: string;
  solicitedAt: string;
  raw?: Record<string, unknown>;
};

type ArquivoTeste = {
  phone: string;
  createdAt: string;
  solicitacoes: SolicitacaoGuardada[];
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return undefined;
  return process.argv[i + 1]?.trim() || undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(name);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function placasAlvo(): string[] {
  const raw = arg("--placas");
  if (raw) {
    return raw.split(/[,;\s]+/).map((p) => formatPlacaHyphen(p)).filter(Boolean);
  }
  return loadPlacasParaSync();
}

function maxPlacas(list: string[]): string[] {
  const n = Number(arg("--max") ?? "0");
  if (!Number.isFinite(n) || n <= 0) return list;
  return list.slice(0, n);
}

async function faseSolicitar(phone: string, placas: string[]): Promise<ArquivoTeste> {
  const solicitacoes: SolicitacaoGuardada[] = [];
  const delayMs = Number(process.env.SIGAPAY_PIX_SOLICITAR_DELAY_MS ?? "800");

  console.log(`A solicitar SMS para ${placas.length} placa(s)… (telefone ${phone})`);
  for (let i = 0; i < placas.length; i++) {
    const placa = placas[i]!;
    try {
      const r = await solicitarCodigoPixRegularizacao(phone, placa);
      solicitacoes.push({
        phone: r.phone,
        placa: formatPlacaHyphen(placa),
        id: r.id,
        solicitedAt: new Date().toISOString(),
        raw: r.raw,
      });
      console.log(`  OK ${placa} → id ${r.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ERRO ${placa}: ${msg}`);
    }
    if (i < placas.length - 1) await sleep(delayMs);
  }

  const arquivo: ArquivoTeste = {
    phone,
    createdAt: new Date().toISOString(),
    solicitacoes,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(arquivo, null, 2) + "\n", "utf8");
  console.log(`\nGuardado: ${OUT_FILE}`);
  console.log(`${solicitacoes.length} id(s). Quando receber o SMS, corra:`);
  console.log(`  npx tsx scripts/testSigapayPixOtpPlacas.ts --verify --code SEU_CODIGO`);
  return arquivo;
}

function carregarArquivo(): ArquivoTeste {
  if (!fs.existsSync(OUT_FILE)) {
    throw new Error(`Ficheiro não encontrado: ${OUT_FILE} — corra primeiro com --solicitar`);
  }
  return JSON.parse(fs.readFileSync(OUT_FILE, "utf8")) as ArquivoTeste;
}

async function faseVerificar(code: string, solicitacoes: SolicitacaoGuardada[]): Promise<void> {
  console.log(`A verificar OTP "${code}" em ${solicitacoes.length} id(s)…\n`);

  let ok = 0;
  let falha = 0;

  for (const s of solicitacoes) {
    try {
      const r = await verificarCodigoPixRegularizacao(s.id, code);
      ok++;
      const preview = JSON.stringify(r.raw).slice(0, 120);
      console.log(`  OK  ${s.placa}  id=${s.id}  →  ${preview}${preview.length >= 120 ? "…" : ""}`);
    } catch (err) {
      falha++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAIL ${s.placa}  id=${s.id}  →  ${msg}`);
    }
  }

  console.log(`\nResumo: ${ok} OK · ${falha} falha(s) · ${solicitacoes.length} total`);
  if (ok === solicitacoes.length && solicitacoes.length > 1) {
    console.log("→ O MESMO OTP funcionou em TODAS as placas (ids diferentes).");
  } else if (ok === 1 && solicitacoes.length > 1) {
    console.log("→ OTP só validou 1 id — provavelmente 1 OTP = 1 solicitação (placa).");
  } else if (ok > 1 && ok < solicitacoes.length) {
    console.log("→ OTP validou parcialmente — rever ids/placas acima.");
  }
}

async function faseFull(phone: string, code: string, placas: string[]): Promise<void> {
  if (placas.length === 0) throw new Error("Nenhuma placa na frota.");

  console.log("Modo --full: solicitar 1ª placa, depois solicitar restantes e verificar todas com o mesmo OTP.\n");

  const first = placas[0]!;
  const rest = placas.slice(1);

  const r0 = await solicitarCodigoPixRegularizacao(phone, first);
  console.log(`SMS disparado via placa ${first} → id ${r0.id}`);
  console.log(`A usar OTP fornecido: ${code}\n`);

  const todas: SolicitacaoGuardada[] = [
    {
      phone: r0.phone,
      placa: formatPlacaHyphen(first),
      id: r0.id,
      solicitedAt: new Date().toISOString(),
    },
  ];

  const delayMs = Number(process.env.SIGAPAY_PIX_SOLICITAR_DELAY_MS ?? "800");
  for (const placa of rest) {
    await sleep(delayMs);
    try {
      const r = await solicitarCodigoPixRegularizacao(phone, placa);
      todas.push({
        phone: r.phone,
        placa: formatPlacaHyphen(placa),
        id: r.id,
        solicitedAt: new Date().toISOString(),
      });
      console.log(`  solicitar ${placa} → id ${r.id}`);
    } catch (err) {
      console.log(`  solicitar ${placa} ERRO: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify({ phone, createdAt: new Date().toISOString(), solicitacoes: todas }, null, 2) +
      "\n",
    "utf8",
  );

  await faseVerificar(code, todas);
}

async function main(): Promise<void> {
  const phone = arg("--phone") ?? process.env.SIGAPAY_PIX_PHONE?.trim();
  const code = arg("--code") ?? process.env.SIGAPAY_PIX_OTP?.trim();

  if (flag("--verify")) {
    if (!code) {
      console.error("Use --code CODIGO_SMS (ou SIGAPAY_PIX_OTP)");
      process.exit(1);
    }
    const arquivo = carregarArquivo();
    await faseVerificar(code, arquivo.solicitacoes);
    return;
  }

  if (flag("--full")) {
    if (!phone || !code) {
      console.error("Modo --full exige --phone e --code (OTP já recebido)");
      process.exit(1);
    }
    const placas = maxPlacas(placasAlvo());
    await faseFull(phone, code, placas);
    return;
  }

  if (flag("--solicitar")) {
    if (!phone) {
      console.error("Use --phone TELEFONE (ou SIGAPAY_PIX_PHONE)");
      process.exit(1);
    }
    const placas = maxPlacas(placasAlvo());
    if (!placas.length) {
      console.error("Nenhuma placa activa em veiculos.json");
      process.exit(1);
    }
    await faseSolicitar(phone, placas);
    return;
  }

  console.log(`Teste OTP SigaPay PIX — um código para várias placas

Uso:
  1) Solicitar (vai SMS):
     npx tsx scripts/testSigapayPixOtpPlacas.ts --phone 48999999999 --solicitar --max 5

  2) Verificar mesmo OTP em todos os ids:
     npx tsx scripts/testSigapayPixOtpPlacas.ts --verify --code 62424

  3) Teste completo (já tem OTP; solicita todas + verifica):
     npx tsx scripts/testSigapayPixOtpPlacas.ts --phone 48999999999 --code 62424 --full --max 5

Opções:
  --placas ABC1D23,XYZ9E87   lista manual (default: frota activa)
  --max N                    limitar placas
  Ficheiro ids: ${OUT_FILE}
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
