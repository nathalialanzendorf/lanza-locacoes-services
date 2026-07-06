/**
 * Parcelas de caução — texto (Gastos Gerais) e calendário (cláusula 3.3 / despesas).
 *
 * Sufixo `{parcelaAtual}x{totalParcelas}` — o segundo número é o **total de parcelas**,
 * **não** o dia do mês.
 */

export function infoParcelaCaucao(
  parcelaAtual: number,
  totalParcelas: number,
  opts?: { atrasado?: boolean },
): string {
  const suffix = `${parcelaAtual}x${totalParcelas}`;
  if (opts?.atrasado === false) {
    return `Pagamento caução - ${suffix}`;
  }
  return `ATRASADO Pagamento caução - ${suffix}`;
}

/** Entrada única na retirada (sem parcelamento). */
export function infoCaucaoEntrada(): string {
  return "Pagamento caução";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDataBr(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function parseDataBrToDate(dataBr: string): Date {
  const m = dataBr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error(`Data inválida "${dataBr}" — use DD/MM/AAAA.`);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
}

/** Dia da semana (0=dom … 6=sáb) a partir do texto de `--dia-pagamento`. */
export function diaPagamentoParaDow(diaPagamento?: string | null): number {
  const t = String(diaPagamento ?? "sábado")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  if (t.includes("domingo")) return 0;
  if (t.includes("segunda")) return 1;
  if (t.includes("terca")) return 2;
  if (t.includes("quarta")) return 3;
  if (t.includes("quinta")) return 4;
  if (t.includes("sexta")) return 5;
  return 6;
}

/**
 * Datas das parcelas de caução em aberto — **1.ª parcela na semana seguinte**
 * ao dia de pagamento imediato após a retirada.
 *
 * Ex.: retirada 03/07/2026 (sex), pagamento sábado → 1.ª parcela 11/07/2026.
 */
export function gerarDatasParcelasCaucao(
  inicioBr: string,
  parcelas: number,
  diaPagamento?: string | null,
): string[] {
  if (parcelas < 1) throw new Error("parcelas deve ser >= 1.");
  const dow = diaPagamentoParaDow(diaPagamento);
  const inicio = parseDataBrToDate(inicioBr);
  const first = new Date(inicio);
  while (first.getDay() !== dow) {
    first.setDate(first.getDate() + 1);
  }
  first.setDate(first.getDate() + 7);

  const out: string[] = [];
  for (let i = 0; i < parcelas; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i * 7);
    out.push(formatDataBr(d));
  }
  return out;
}
