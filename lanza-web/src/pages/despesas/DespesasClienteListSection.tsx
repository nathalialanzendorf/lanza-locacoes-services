import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ClienteSelect, VeiculoSelect, NativeSelect } from "@/components/EntitySelects";
import { SELECT_LABEL_TODOS } from "@/lib/selectLabels";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useDespesasCliente, useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatVeiculoLabel } from "@/lib/format";
import type { ClienteDespesa, Veiculo } from "@/api/types";

const CATEGORIAS = [
  "Manutenção",
  "Locação semanal",
  "Caução",
  "Outros",
  "Pedágio",
  "Infração",
  "Estacionamento",
] as const;

type FiltroPagamento = "em_aberto" | "pago" | "todos";

function compactPlaca(placa: string): string {
  return placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function veiculoLabelDespesa(
  d: ClienteDespesa,
  porId: Map<string, Veiculo>,
  porPlaca: Map<string, Veiculo>,
): string {
  const placaKey = compactPlaca(d.placa ?? d.veiculoId ?? "");
  const v =
    (d.veiculoId?.trim() ? porId.get(d.veiculoId.trim()) : undefined) ??
    (placaKey ? porPlaca.get(placaKey) : undefined);
  if (v) return formatVeiculoLabel(v);
  return formatVeiculoLabel({ placa: d.placa ?? d.veiculoId });
}

export function DespesasClienteListSection() {
  const qc = useQueryClient();
  const [pagamento, setPagamento] = useState<FiltroPagamento>("em_aberto");
  const [clienteId, setClienteId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const veiculosQuery = useVeiculos();

  const veiculosPorId = useMemo(() => {
    const map = new Map<string, Veiculo>();
    for (const v of veiculosQuery.data?.items ?? []) {
      map.set(v.id, v);
    }
    return map;
  }, [veiculosQuery.data]);

  const veiculosPorPlaca = useMemo(() => {
    const map = new Map<string, Veiculo>();
    for (const v of veiculosQuery.data?.items ?? []) {
      if (v.placa) map.set(compactPlaca(v.placa), v);
    }
    return map;
  }, [veiculosQuery.data]);

  const query = useDespesasCliente({
    ativo: true,
    emAberto: pagamento === "em_aberto" ? true : pagamento === "pago" ? false : undefined,
    clienteId: clienteId || undefined,
    veiculoId: veiculoId || undefined,
    categoria: categoria || undefined,
    competencia: competencia.trim() || undefined,
  });

  const rows = query.data?.items ?? [];
  const temFiltro =
    pagamento !== "em_aberto" || Boolean(clienteId || veiculoId || categoria || competencia.trim());

  const total = useMemo(
    () => rows.reduce((sum, d) => sum + (Number(d.valorMulta) || 0), 0),
    [rows],
  );

  async function excluir(despesa: ClienteDespesa) {
    const label = despesa.descricao ?? despesa.categoria ?? despesa.id;
    if (!window.confirm(`Excluir a despesa "${label}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(despesa.id);
    try {
      await lanzaApi.removerDespesaCliente(despesa.id);
      void qc.invalidateQueries({ queryKey: ["despesas-cliente"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir despesa.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <>
      <ListToolbar addTo="/despesas/cliente/novo">
        <ClienteSelect value={clienteId} onChange={setClienteId} variant="filtro" />
        <VeiculoSelect
          value={veiculoId}
          onChange={setVeiculoId}
          valueField="id"
          variant="filtro"
        />
        <NativeSelect
          value={categoria}
          onChange={setCategoria}
          variant="filtro"
          aria-label="Categoria"
        >
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={pagamento}
          onChange={(v) => setPagamento(v as FiltroPagamento)}
          variant="filtro"
          allowEmpty={false}
          aria-label="Pagamento"
        >
          <option value="em_aberto">Em aberto</option>
          <option value="pago">Pago</option>
          <option value="todos">{SELECT_LABEL_TODOS}</option>
        </NativeSelect>
        <input
          className="input"
          placeholder="Competência (MM/AAAA)"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          aria-label="Competência"
        />
        {!query.isLoading ? (
          <span className="badge badge--muted">
            {rows.length} lançamento{rows.length === 1 ? "" : "s"} · {formatBrl(total)}
          </span>
        ) : null}
      </ListToolbar>

      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar débitos do cliente."}
        />
      ) : null}

      <DataTable
        loading={query.isLoading}
        rows={rows}
        keyFn={(d) => d.id}
        emptyMessage={temFiltro ? "Nenhuma despesa corresponde aos filtros." : "Nenhuma despesa registada."}
        columns={[
          {
            key: "veiculo",
            header: "Veículo",
            render: (d) => veiculoLabelDespesa(d, veiculosPorId, veiculosPorPlaca),
          },
          { key: "desc", header: "Descrição", render: (d) => d.descricao ?? "—" },
          { key: "categoria", header: "Categoria", render: (d) => d.categoria ?? "—" },
          {
            key: "acoes",
            header: "Ações",
            className: "col-acoes",
            render: (d) => (
              <RowActions
                editTo={`/despesas/cliente/${d.id}/editar`}
                deleting={excluindoId === d.id}
                onDelete={() => void excluir(d)}
              />
            ),
          },
        ]}
      />
    </>
  );
}
