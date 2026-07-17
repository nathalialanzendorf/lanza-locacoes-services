import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca, statusClass, statusLabel } from "@/lib/format";
import type { Veiculo } from "@/api/types";

export function VeiculosListSection() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"ativos" | "todos">("ativos");
  const [placa, setPlaca] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const query = useVeiculos({
    ativo: filtro === "ativos" ? true : undefined,
    placa: placa.trim() || undefined,
  });

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

  return (
    <>
      <ListToolbar addTo="/veiculos/novo" addLabel="Adicionar veículo">
        <input
          className="input"
          placeholder="Filtrar placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
        <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
          <option value="ativos">Só ativos</option>
          <option value="todos">Todos</option>
        </select>
      </ListToolbar>
      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar veículos."}
        />
      ) : null}
      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(v) => v.id}
        columns={[
          { key: "placa", header: "Placa", render: (v) => <strong>{formatPlaca(v.placa)}</strong> },
          { key: "modelo", header: "Marca / modelo", render: (v) => v.marcaModelo ?? "—" },
          { key: "uf", header: "UF", render: (v) => v.ufRegistro ?? "SC" },
          {
            key: "ativo",
            header: "Status",
            render: (v) => <span className={statusClass(v.ativo)}>{statusLabel(v.ativo)}</span>,
          },
          {
            key: "acoes",
            header: "Ações",
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
