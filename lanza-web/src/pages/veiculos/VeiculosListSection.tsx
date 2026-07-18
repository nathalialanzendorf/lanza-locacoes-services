import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { VeiculoSelect } from "@/components/EntitySelects";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useParceiros, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca, statusClass, statusLabel } from "@/lib/format";
import type { Veiculo } from "@/api/types";

type Filtro = "ativos" | "inativos" | "todos";

export function VeiculosListSection() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [veiculoId, setVeiculoId] = useState("");
  const [parceiroId, setParceiroId] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const ativo = filtro === "ativos" ? true : filtro === "inativos" ? false : undefined;
  const query = useVeiculos({ ativo });
  const parceirosQuery = useParceiros();
  const vinculosQuery = useVinculosParceiro();

  const parceirosOrdenados = useMemo(
    () =>
      [...(parceirosQuery.data?.items ?? [])].sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR"),
      ),
    [parceirosQuery.data],
  );

  const { parceiroPorVeiculoId, parceiroIdPorVeiculoId } = useMemo(() => {
    const nomes = new Map((parceirosQuery.data?.items ?? []).map((p) => [p.id, p.nome]));
    const parceiroPorVeiculoId = new Map<string, string>();
    const parceiroIdPorVeiculoId = new Map<string, string>();
    for (const v of vinculosQuery.data?.items ?? []) {
      parceiroIdPorVeiculoId.set(v.veiculoId, v.parceiroId);
      const nome = nomes.get(v.parceiroId);
      if (nome) parceiroPorVeiculoId.set(v.veiculoId, nome);
    }
    return { parceiroPorVeiculoId, parceiroIdPorVeiculoId };
  }, [parceirosQuery.data, vinculosQuery.data]);

  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    return items.filter((v) => {
      if (veiculoId && v.id !== veiculoId) return false;
      if (parceiroId && parceiroIdPorVeiculoId.get(v.id) !== parceiroId) return false;
      return true;
    });
  }, [query.data, veiculoId, parceiroId, parceiroIdPorVeiculoId]);

  const temFiltro = Boolean(veiculoId || parceiroId);

  function parceiroDoVeiculo(veiculo: Veiculo): string {
    return parceiroPorVeiculoId.get(veiculo.id) ?? "—";
  }

  async function excluir(veiculo: Veiculo) {
    const label = formatPlaca(veiculo.placa ?? veiculo.id);
    if (!window.confirm(`Excluir o veículo ${label}? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(veiculo.id);
    try {
      await lanzaApi.removerVeiculo(veiculo.id);
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
      void qc.invalidateQueries({ queryKey: ["parceiros-vinculos"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir veículo.");
    } finally {
      setExcluindoId(null);
    }
  }

  const loadingExtra = parceirosQuery.isLoading || vinculosQuery.isLoading;

  return (
    <>
      <ListToolbar addTo="/veiculos/novo" importTo="/veiculos/importar">
        <VeiculoSelect
          value={veiculoId}
          onChange={setVeiculoId}
          valueField="id"
          ativo={ativo}
          emptyLabel="Todos os veículos"
        />
        <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Status">
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        <select
          className="select"
          value={parceiroId}
          onChange={(e) => setParceiroId(e.target.value)}
          aria-label="Parceiro"
        >
          <option value="">Todos os parceiros</option>
          {parceirosOrdenados.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        {!query.isLoading ? (
          <span className="badge badge--muted">
            {rows.length} veículo{rows.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </ListToolbar>
      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar veículos."}
        />
      ) : null}
      <DataTable
        loading={query.isLoading || loadingExtra}
        rows={rows}
        keyFn={(v) => v.id}
        emptyMessage={
          temFiltro ? "Nenhum veículo corresponde aos filtros." : "Nenhum veículo registado."
        }
        columns={[
          { key: "placa", header: "Placa", render: (v) => <strong>{formatPlaca(v.placa)}</strong> },
          { key: "marcaModelo", header: "Marca / modelo", render: (v) => v.marcaModelo ?? "—" },
          { key: "ano", header: "Ano", render: (v) => v.anoModelo ?? "—" },
          { key: "parceiro", header: "Parceiro", render: (v) => parceiroDoVeiculo(v) },
          {
            key: "status",
            header: "Status",
            render: (v) => <span className={statusClass(v.ativo)}>{statusLabel(v.ativo)}</span>,
          },
          {
            key: "acoes",
            header: "Ações",
            className: "col-acoes",
            render: (v) => (
              <RowActions
                editTo={`/veiculos/${v.id}/editar`}
                deleting={excluindoId === v.id}
                onDelete={() => void excluir(v)}
              />
            ),
          },
        ]}
      />
    </>
  );
}
