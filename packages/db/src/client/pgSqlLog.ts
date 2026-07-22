import type pg from "pg";

let sqlSeq = 0;

function sqlLoggingEnabled(): boolean {
  const v = process.env.LANZA_SQL_LOG?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

function sqlPreview(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

export function nextSqlSeq(): number {
  sqlSeq += 1;
  return sqlSeq;
}

export function resetSqlSeq(): void {
  sqlSeq = 0;
}

export function logSqlStart(n: number, text: string, label?: string): void {
  if (!sqlLoggingEnabled()) return;
  const tag = label ? ` ${label}` : "";
  console.log(`[lanza/sql] #${n} START${tag}: ${sqlPreview(text)}`);
}

export function logSqlDone(n: number, ms: number, rowCount?: number | null): void {
  if (!sqlLoggingEnabled()) return;
  const rows = rowCount == null ? "" : ` rows=${rowCount}`;
  console.log(`[lanza/sql] #${n} DONE ${ms}ms${rows}`);
}

export function logSqlError(n: number, ms: number, err: unknown): void {
  if (!sqlLoggingEnabled()) return;
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[lanza/sql] #${n} ERROR ${ms}ms: ${msg}`);
}

export async function loggedPgQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(
  queryFn: (text: string, params?: unknown[]) => Promise<pg.QueryResult<T>>,
  text: string,
  params?: unknown[],
  label?: string,
): Promise<pg.QueryResult<T>> {
  const n = nextSqlSeq();
  logSqlStart(n, text, label);
  const t0 = Date.now();
  try {
    const result = await queryFn(text, params);
    logSqlDone(n, Date.now() - t0, result.rowCount);
    return result;
  } catch (err) {
    logSqlError(n, Date.now() - t0, err);
    throw err;
  }
}

/** Marcador de etapa de alto nível (ex.: fluxo recebimentos/plano). */
export function logFlowStep(route: string, step: number, message: string): void {
  if (!sqlLoggingEnabled()) return;
  console.log(`[lanza/flow] ${route} #${step} ${message}`);
}
