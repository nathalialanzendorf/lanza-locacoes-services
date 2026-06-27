import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./repoRoot.js";

/** Raiz dos relatórios gerados pelo repo (não confundir com prestação de contas no Dropbox). */
export const RELATORIOS_DIR = path.join(REPO_ROOT, "relatorios");

/** Quebra / acerto de encerramento de contrato (`quebra-contrato-*.txt`). */
export const RELATORIOS_QUEBRA_CONTRATO_DIR = path.join(RELATORIOS_DIR, "quebra-contrato");

/** @deprecated use RELATORIOS_QUEBRA_CONTRATO_DIR */
export const RELATORIOS_ENCERRAMENTO_DIR = RELATORIOS_QUEBRA_CONTRATO_DIR;

/** Saídas de sync DETRAN e rotinas em lote. */
export const RELATORIOS_SYNC_DIR = path.join(RELATORIOS_DIR, "sync");

/** Relatórios operacionais do repo (listagens semanais, notas internas). */
export const RELATORIOS_PRESTACAO_CONTAS_DIR = path.join(RELATORIOS_DIR, "prestacao-contas");

/** @deprecated use RELATORIOS_PRESTACAO_CONTAS_DIR */
export const RELATORIOS_OPERACIONAL_DIR = RELATORIOS_PRESTACAO_CONTAS_DIR;

/** Rascunhos e JSON temporários para CLI (`_*`, entradas manuais). */
export const RELATORIOS_TMP_DIR = path.join(RELATORIOS_DIR, "_tmp");

export function ensureRelatoriosDirs(): void {
  for (const dir of [
    RELATORIOS_DIR,
    RELATORIOS_QUEBRA_CONTRATO_DIR,
    RELATORIOS_SYNC_DIR,
    RELATORIOS_PRESTACAO_CONTAS_DIR,
    RELATORIOS_TMP_DIR,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
