import { brToIsoDate, isoDateToBr } from "@/lib/dateBr";

/** Competência MM/AAAA a partir de DD/MM/AAAA. */
export function competenciaDeDataBr(dataBr: string): string | null {
  const m = dataBr.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[2]!.padStart(2, "0")}/${m[3]}`;
}

/** Último dia do mês de uma data DD/MM/AAAA. */
export function ultimoDiaMesBr(dataBr: string): string | null {
  const iso = brToIsoDate(dataBr);
  if (!iso) return null;
  const [y, mo] = iso.split("-").map(Number);
  const ultimo = new Date(y!, mo!, 0);
  return isoDateToBr(
    `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, "0")}-${String(ultimo.getDate()).padStart(2, "0")}`,
  );
}

export function periodoPreenchido(periodo: { dataInicial: string; dataFinal: string }): boolean {
  return Boolean(periodo.dataInicial.trim() || periodo.dataFinal.trim());
}

export function periodoValido(periodo: { dataInicial: string; dataFinal: string }): boolean {
  const ini = periodo.dataInicial.trim();
  const fim = periodo.dataFinal.trim();
  if (!ini && !fim) return true;
  if (ini && !brToIsoDate(ini)) return false;
  if (fim && !brToIsoDate(fim)) return false;
  if (ini && fim) {
    return brToIsoDate(ini)! <= brToIsoDate(fim)!;
  }
  return true;
}
