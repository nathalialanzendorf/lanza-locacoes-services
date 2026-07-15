import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { useContratos } from "@/api/hooks";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";

export function ContratosPage() {
  const [status, setStatus] = useState<"ativo" | "encerrado" | "">("ativo");
  const query = useContratos({
    status: status || undefined,
  });

  return (
    <PageHeader
      title="Contratos"
      description="Contratos de locação gerados e registados em contratos.json."
      actions={
        <select
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="ativo">Ativos</option>
          <option value="encerrado">Encerrados</option>
          <option value="">Todos</option>
        </select>
      }
    >
      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError
              ? query.error.message
              : "Falha ao listar contratos."
          }
        />
      ) : null}

      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(c) => c.id}
        columns={[
          { key: "pasta", header: "Pasta / referência", render: (c) => c.pasta ?? c.id },
          {
            key: "placa",
            header: "Placa",
            render: (c) => formatPlaca(c.placa),
          },
          {
            key: "status",
            header: "Status",
            render: (c) => (
              <span
                className={
                  c.status === "ativo" ? "badge badge--ok" : "badge badge--muted"
                }
              >
                {c.status ?? "—"}
              </span>
            ),
          },
          { key: "inicio", header: "Início", render: (c) => c.dataInicio ?? "—" },
          { key: "fim", header: "Fim", render: (c) => c.dataFim ?? "—" },
        ]}
      />
    </PageHeader>
  );
}
