import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./repoRoot.js";

/** Raiz dos relatórios gerados pelo repo (não confundir com prestação de contas no Dropbox). */
export const RELATORIOS_DIR = path.join(REPO_ROOT, "relatorios");

/**
 * Todas as saídas geradas pela CLI ficam sob `relatorios/_tmp/<tipo>/`.
 * Essa pasta é ignorada pelo git (.gitignore) — relatórios não são comitados.
 */
export const RELATORIOS_TMP_DIR = path.join(RELATORIOS_DIR, "_tmp");

/** Quebra / acerto de encerramento de contrato (`quebra-contrato-*.txt`). */
export const RELATORIOS_QUEBRA_CONTRATO_DIR = path.join(RELATORIOS_TMP_DIR, "quebra-contrato");

/** @deprecated use RELATORIOS_QUEBRA_CONTRATO_DIR */
export const RELATORIOS_ENCERRAMENTO_DIR = RELATORIOS_QUEBRA_CONTRATO_DIR;

/** Saídas de sync DETRAN e rotinas em lote. */
export const RELATORIOS_SYNC_DIR = path.join(RELATORIOS_TMP_DIR, "sync");

/** Relatórios operacionais do repo (listagens semanais, notas internas). */
export const RELATORIOS_PRESTACAO_CONTAS_DIR = path.join(RELATORIOS_TMP_DIR, "prestacao-contas");

/** @deprecated use RELATORIOS_PRESTACAO_CONTAS_DIR */
export const RELATORIOS_OPERACIONAL_DIR = RELATORIOS_PRESTACAO_CONTAS_DIR;

/** Mensagens de cobrança geradas (`cobranca-*.txt`). */
export const RELATORIOS_COBRANCAS_DIR = path.join(RELATORIOS_TMP_DIR, "cobrancas");

/** Análise de cadastro de locatário (`<cpf>-<data>.json|.txt` e downloads). */
export const RELATORIOS_ANALISE_CADASTRO_DIR = path.join(RELATORIOS_TMP_DIR, "analise-cadastro");

export function ensureRelatoriosDirs(): void {
  for (const dir of [
    RELATORIOS_DIR,
    RELATORIOS_TMP_DIR,
    RELATORIOS_QUEBRA_CONTRATO_DIR,
    RELATORIOS_SYNC_DIR,
    RELATORIOS_PRESTACAO_CONTAS_DIR,
    RELATORIOS_COBRANCAS_DIR,
    RELATORIOS_ANALISE_CADASTRO_DIR,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
