import { DateInput } from "@/components/DateInput";
import { Field } from "@/components/FormCard";

export type RelatorioPeriodo = {
  dataInicial: string;
  dataFinal: string;
};

export const PERIODO_VAZIO: RelatorioPeriodo = { dataInicial: "", dataFinal: "" };

type RelatorioPeriodoFiltroProps = {
  value: RelatorioPeriodo;
  onChange: (value: RelatorioPeriodo) => void;
  disabled?: boolean;
  hint?: string;
};

/** Filtro de período padrão dos relatórios (data inicial + final, DD/MM/AAAA). */
export function RelatorioPeriodoFiltro({
  value,
  onChange,
  disabled,
  hint = "Opcional — filtra registos no intervalo inclusivo",
}: RelatorioPeriodoFiltroProps) {
  return (
    <>
      <Field label="Data inicial" hint={hint}>
        <DateInput
          value={value.dataInicial}
          onChange={(dataInicial) => onChange({ ...value, dataInicial })}
          disabled={disabled}
        />
      </Field>
      <Field label="Data final">
        <DateInput
          value={value.dataFinal}
          onChange={(dataFinal) => onChange({ ...value, dataFinal })}
          disabled={disabled}
        />
      </Field>
    </>
  );
}
