import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useContratos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";
import type { Contrato } from "@/api/types";

export function ContratosListSection() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"ativo" | "encerrado" | "">("ativo");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const query = useContratos({ status: status || undefined });

  async function excluir(contrato: Contrato) {
    const label = contrato.pasta ?? contrato.placa ?? contrato.id;
    if (!window.confirm(`Excluir o contrato "${label}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(contrato.id);
    try {
      await lanzaApi.removerContrato(contrato.id);
      void qc.invalidateQueries({ queryKey: ["contratos"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir contrato.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <>
      <ListToolbar addTo="/contratos/novo" addLabel="Adicionar contrato">
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="ativo">Ativos</option>
          <option value="encerrado">Encerrados</option>
          <option value="">Todos</option>
        </select>
        <Link to="/contratos/encerrar" className="btn btn--ghost btn--sm">
          Encerrar contrato
        </Link>
      </ListToolbar>
      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar contratos."}
        />
      ) : null}
      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(c) => c.id}
        columns={[
          { key: "pasta", header: "Pasta", render: (c) => c.pasta ?? c.id },
          { key: "placa", header: "Placa", render: (c) => formatPlaca(c.placa) },
          {
            key: "status",
            header: "Status",
            render: (c) => (
              <span className={c.status === "ativo" ? "badge badge--ok" : "badge badge--muted"}>
                {c.status ?? "—"}
              </span>
            ),
          },
          { key: "inicio", header: "Início", render: (c) => c.dataInicio ?? "—" },
          { key: "fim", header: "Fim", render: (c) => c.dataFim ?? "—" },
          {
            key: "acoes",
            header: "Ações",
            render: (c) => (
              <RowActions
                editTo={`/contratos/${c.id}/editar`}
                deleting={excluindoId === c.id}
                onDelete={() => void excluir(c)}
              />
            ),
          },
        ]}
      />
    </>
  );
}
