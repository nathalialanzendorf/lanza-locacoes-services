/** Dia da semana (Date.getDay(): 0 = domingo … 6 = sábado). */
export const DiaSemanaJs = {
  Domingo: 0,
  Segunda: 1,
  Terca: 2,
  Quarta: 3,
  Quinta: 4,
  Sexta: 5,
  Sabado: 6,
} as const;

export type DiaSemanaJsValor = (typeof DiaSemanaJs)[keyof typeof DiaSemanaJs];

export type DiaSemanaDef = {
  jsDay: DiaSemanaJsValor;
  label: string;
  labelCurto: string;
  contratoClausula: string;
  chave: string;
};

export const DIAS_SEMANA: readonly DiaSemanaDef[] = [
  {
    jsDay: DiaSemanaJs.Domingo,
    label: "Domingo",
    labelCurto: "Domingo",
    contratoClausula: "todos os domingos",
    chave: "domingo",
  },
  {
    jsDay: DiaSemanaJs.Segunda,
    label: "Segunda-feira",
    labelCurto: "Segunda",
    contratoClausula: "todas as segundas-feiras",
    chave: "segunda",
  },
  {
    jsDay: DiaSemanaJs.Terca,
    label: "Terça-feira",
    labelCurto: "Terça",
    contratoClausula: "todas as terças-feiras",
    chave: "terca",
  },
  {
    jsDay: DiaSemanaJs.Quarta,
    label: "Quarta-feira",
    labelCurto: "Quarta",
    contratoClausula: "todas as quartas-feiras",
    chave: "quarta",
  },
  {
    jsDay: DiaSemanaJs.Quinta,
    label: "Quinta-feira",
    labelCurto: "Quinta",
    contratoClausula: "todas as quintas-feiras",
    chave: "quinta",
  },
  {
    jsDay: DiaSemanaJs.Sexta,
    label: "Sexta-feira",
    labelCurto: "Sexta",
    contratoClausula: "todas as sextas-feiras",
    chave: "sexta",
  },
  {
    jsDay: DiaSemanaJs.Sabado,
    label: "Sábado",
    labelCurto: "Sábado",
    contratoClausula: "todos os sábados",
    chave: "sabado",
  },
] as const;

export const DOW_JS_LABELS = DIAS_SEMANA.map((d) => d.labelCurto);

export const DOW_JS: Record<string, number> = Object.fromEntries(
  DIAS_SEMANA.flatMap((d) => {
    const entries: [string, number][] = [[d.chave, d.jsDay]];
    if (d.chave === "terca") entries.push(["terça", d.jsDay]);
    if (d.chave === "sabado") entries.push(["sábado", d.jsDay]);
    return entries;
  }),
);

export function diaSemanaPorJsDay(jsDay: number): DiaSemanaDef | null {
  return DIAS_SEMANA[jsDay] ?? null;
}

export function labelCurtoDiaSemana(jsDay: number): string | null {
  return diaSemanaPorJsDay(jsDay)?.labelCurto ?? null;
}
