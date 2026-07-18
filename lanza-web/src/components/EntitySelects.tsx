import type { ReactNode } from "react";
import { useMemo } from "react";

import { useClientes, useParceiros, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { formatClienteLabel, formatVeiculoLabel } from "@/lib/format";
import { selectEmptyLabel, type SelectEmptyVariant } from "@/lib/selectLabels";
import type { Cliente, Parceiro, Veiculo } from "@/api/types";

type SelectBaseProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  allowEmpty?: boolean;
  /** Consulta/filtro → ---Todos---; cadastro → --- Selecionar --- */
  variant?: SelectEmptyVariant;
  /** Sobrescreve o rótulo definido por `variant`. */
  emptyLabel?: string;
  className?: string;
  id?: string;
};

function SelectShell({
  value,
  onChange,
  required,
  disabled,
  allowEmpty = true,
  variant = "cadastro",
  emptyLabel,
  className = "select",
  id,
  loading,
  children,
}: SelectBaseProps & { loading?: boolean; children: ReactNode }) {
  const label = emptyLabel ?? selectEmptyLabel(variant);
  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled || loading}
    >
      {allowEmpty ? <option value="">{loading ? "A carregar…" : label}</option> : null}
      {children}
    </select>
  );
}

/** Opção vazia padronizada para `<select>` nativos. */
export function SelectEmptyOption({
  variant = "filtro",
  loading,
}: {
  variant?: SelectEmptyVariant;
  loading?: boolean;
}) {
  return <option value="">{loading ? "A carregar…" : selectEmptyLabel(variant)}</option>;
}

export type NativeSelectProps = {
  value: string;
  onChange: (value: string) => void;
  variant?: SelectEmptyVariant;
  allowEmpty?: boolean;
  emptyLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  children: ReactNode;
};

/** `<select>` nativo com placeholder ---Todos--- (filtro) ou --- Selecionar --- (cadastro). */
export function NativeSelect({
  value,
  onChange,
  variant = "cadastro",
  allowEmpty = true,
  emptyLabel,
  loading,
  disabled,
  required,
  className = "select",
  id,
  "aria-label": ariaLabel,
  children,
}: NativeSelectProps) {
  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled || loading}
      aria-label={ariaLabel}
    >
      {allowEmpty ? (
        <option value="">{loading ? "A carregar…" : (emptyLabel ?? selectEmptyLabel(variant))}</option>
      ) : null}
      {children}
    </select>
  );
}

function clienteValue(c: Cliente, field: "id" | "cpf" | "nome"): string {
  if (field === "id") return c.id;
  if (field === "cpf") return c.cpf?.trim() ?? "";
  return c.nome?.trim() ?? c.id;
}

export type ClienteSelectProps = SelectBaseProps & {
  valueField?: "id" | "cpf" | "nome";
  ativo?: boolean;
};

export function ClienteSelect({ valueField = "id", ativo, ...props }: ClienteSelectProps) {
  const query = useClientes(ativo);
  const items = useMemo(() => {
    const list = [...(query.data?.items ?? [])].sort((a, b) =>
      (a.nome ?? a.id).localeCompare(b.nome ?? b.id, "pt-BR"),
    );
    if (valueField === "cpf") return list.filter((c) => c.cpf?.trim());
    if (valueField === "nome") return list.filter((c) => c.nome?.trim());
    return list;
  }, [query.data, valueField]);

  return (
    <SelectShell {...props} loading={query.isLoading}>
      {items.map((c) => (
        <option key={c.id} value={clienteValue(c, valueField)}>
          {formatClienteLabel(c)}
        </option>
      ))}
    </SelectShell>
  );
}

function veiculoValue(v: Veiculo, field: "id" | "placa"): string {
  if (field === "id") return v.id;
  return v.placa?.trim() ?? v.id;
}

export type VeiculoSelectProps = SelectBaseProps & {
  valueField?: "id" | "placa";
  ativo?: boolean;
  clienteId?: string;
  parceiroId?: string;
};

export function VeiculoSelect({
  valueField = "placa",
  ativo,
  clienteId,
  parceiroId,
  ...props
}: VeiculoSelectProps) {
  const query = useVeiculos({ ativo });
  const vinculosQuery = useVinculosParceiro(
    parceiroId?.trim() ? { parceiroId: parceiroId.trim() } : undefined,
  );
  const items = useMemo(() => {
    let list = query.data?.items ?? [];
    if (clienteId?.trim()) {
      list = list.filter((v) => v.clienteVinculadoId === clienteId.trim());
    }
    if (parceiroId?.trim()) {
      const veiculoIds = new Set((vinculosQuery.data?.items ?? []).map((v) => v.veiculoId));
      list = list.filter((v) => veiculoIds.has(v.id));
    }
    return [...list].sort((a, b) => (a.placa ?? a.id).localeCompare(b.placa ?? b.id, "pt-BR"));
  }, [query.data, clienteId, parceiroId, vinculosQuery.data]);

  return (
    <SelectShell {...props} loading={query.isLoading || (parceiroId?.trim() ? vinculosQuery.isLoading : false)}>
      {items.map((v) => (
        <option key={v.id} value={veiculoValue(v, valueField)}>
          {formatVeiculoLabel(v)}
        </option>
      ))}
    </SelectShell>
  );
}

export type ParceiroSelectProps = SelectBaseProps & {
  /** Somente parceiros com status ativo. */
  ativo?: boolean;
};

export function ParceiroSelect({ ativo, ...props }: ParceiroSelectProps) {
  const query = useParceiros(ativo ? true : undefined);
  const items = useMemo(
    () => [...(query.data?.items ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [query.data],
  );

  return (
    <SelectShell {...props} loading={query.isLoading}>
      {items.map((p: Parceiro) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </SelectShell>
  );
}

export function matchParceiroIdPorNome(parceiros: Parceiro[] | undefined, nome: string): string {
  const alvo = nome.trim().toLowerCase();
  if (!alvo) return "";
  const exato = parceiros?.find((p) => p.nome.trim().toLowerCase() === alvo);
  if (exato) return exato.id;
  const parcial = parceiros?.filter((p) => {
    const n = p.nome.trim().toLowerCase();
    return n.includes(alvo) || alvo.includes(n);
  });
  return parcial?.length === 1 ? parcial[0]!.id : "";
}

export function matchVeiculoSelectValue(
  veiculos: Veiculo[] | undefined,
  ref: string | undefined,
  valueField: "id" | "placa",
): string {
  if (!ref?.trim() || !veiculos?.length) return ref?.trim() ?? "";
  const r = ref.trim();
  const byId = veiculos.find((v) => v.id === r);
  if (byId) return valueField === "id" ? byId.id : (byId.placa ?? byId.id);
  const placaNorm = r.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const byPlaca = veiculos.find(
    (v) => (v.placa ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === placaNorm,
  );
  if (byPlaca) return valueField === "id" ? byPlaca.id : (byPlaca.placa ?? byPlaca.id);
  return valueField === "placa" ? r : "";
}
