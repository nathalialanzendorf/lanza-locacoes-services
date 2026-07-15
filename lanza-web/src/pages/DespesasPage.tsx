import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { useDespesasCliente } from "@/api/hooks";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatPlaca } from "@/lib/format";

export function DespesasPage() {
  const [emAberto, setEmAberto] = useState(true);
  const query = useDespesasCliente({ emAberto });

  return (
    <PageHeader
      title="Débitos do cliente"
      description="Despesas cobráveis do locatário (multas, pedágio, semanal, etc.)."
      actions={
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={emAberto}
            onChange={(e) => setEmAberto(e.target.checked)}
          />
          Só em aberto
        </label>
      }
    >
      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError
              ? query.error.message
              : "Falha ao listar débitos."
          }
        />
      ) : null}

      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(d) => d.id}
        columns={[
          { key: "categoria", header: "Categoria", render: (d) => d.categoria ?? "—" },
          { key: "desc", header: "Descrição", render: (d) => d.descricao ?? "—" },
          {
            key: "placa",
            header: "Placa",
            render: (d) => formatPlaca(d.placa),
          },
          {
            key: "valor",
            header: "Valor",
            className: "num",
            render: (d) => formatBrl(Number(d.valorMulta) || 0),
          },
          {
            key: "paga",
            header: "Paga",
            render: (d) => (
              <span className={d.paga ? "badge badge--ok" : "badge badge--warn"}>
                {d.paga ? "Sim" : "Não"}
              </span>
            ),
          },
        ]}
      />
    </PageHeader>
  );
}
