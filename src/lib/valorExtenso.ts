/** Valor por extenso (pt-BR / reais) — mesma lógica do gerar_contrato.py. */

const _U = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const _DEZ = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];
const _CEM = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function grupo(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";
  const out: string[] = [];
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c) out.push(_CEM[c]!);
  if (r) {
    if (r < 20) {
      out.push(_U[r]!);
    } else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      out.push(_DEZ[d]! + (u ? ` e ${_U[u]!}` : ""));
    }
  }
  return out.join(" e ");
}

function inteiroExtenso(n: number): string {
  if (n === 0) return "zero";
  const partes: string[] = [];
  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  if (milhoes) {
    partes.push(
      grupo(milhoes) + (milhoes > 1 ? " milhões" : " milhão"),
    );
  }
  if (milhares) {
    partes.push(milhares === 1 ? "mil" : `${grupo(milhares)} mil`);
  }
  if (resto) {
    partes.push(grupo(resto));
  }
  let txt = partes[0]!;
  for (let i = 1; i < partes.length; i++) {
    const ult = partes[i]!;
    const usaE =
      i === partes.length - 1 && (resto < 100 || resto % 100 === 0);
    txt += (usaE ? " e " : ", ") + ult;
  }
  return txt;
}

export function valorExtenso(v: number): string {
  const x = Math.round((Number(v) + 1e-9) * 100) / 100;
  const reais = Math.floor(x);
  const cent = Math.round((x - reais) * 100);
  let txt =
    inteiroExtenso(reais) + (reais === 1 ? " real" : " reais");
  if (cent) {
    txt +=
      " e " +
      inteiroExtenso(cent) +
      (cent === 1 ? " centavo" : " centavos");
  }
  return txt;
}

export function brl(v: number): string {
  const s = Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return s;
}

export function cap(s: string): string {
  if (!s) return s;
  return s.slice(0, 1).toUpperCase() + s.slice(1);
}
