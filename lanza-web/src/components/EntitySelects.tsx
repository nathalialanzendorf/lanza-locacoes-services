import type { ReactNode } from "react";
import { useMemo } from "react";

import { useClientes, useParceiros, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { formatClienteLabel, formatVeiculoLabel } from "@/lib/format";
import type { Cliente, Parceiro, Veiculo } from "@/api/types";

type SelectBaseProps = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  allowEmpty?: boolean;
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
  emptyLabel = "— Selecionar —",
  className = "select",
  id,
  loading,
  children,
}: SelectBaseProps & { loading?: boolean; children: ReactNode }) {
  return (
    <select
      id={id}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled || loading}
    >
      {allowEmpty ? <option value="">{loading ? "A carregar…" : emptyLabel}</option> : null}
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
  /** Parceiros com ao menos um veículo ativo na frota. */
  ativo?: boolean;
};

export function ParceiroSelect({ ativo, ...props }: ParceiroSelectProps) {
  const query = useParceiros();
  const vinculosQuery = useVinculosParceiro();
  const veiculosQuery = useVeiculos(ativo ? { ativo: true } : undefined);
  const items = useMemo(() => {
    let list = [...(query.data?.items ?? [])];
    if (ativo) {
      const veiculosAtivos = new Set((veiculosQuery.data?.items ?? []).map((v) => v.id));
      const parceirosAtivos = new Set<string>();
      for (const v of vinculosQuery.data?.items ?? []) {
        if (veiculosAtivos.has(v.veiculoId)) parceirosAtivos.add(v.parceiroId);
      }
      list = list.filter((p) => parceirosAtivos.has(p.id));
    }
    return list.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [query.data, ativo, vinculosQuery.data, veiculosQuery.data]);

  return (
    <SelectShell
      {...props}
      loading={query.isLoading || (ativo ? vinculosQuery.isLoading || veiculosQuery.isLoading : false)}
    >
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
