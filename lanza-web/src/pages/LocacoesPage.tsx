import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { useLocacoes } from "@/api/hooks";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";

export function LocacoesPage() {
  const [emAberto, setEmAberto] = useState(true);
  const query = useLocacoes(emAberto ? true : undefined);

  return (
    <PageHeader
      title="Locações"
      description="Movimentação operacional — locado, reserva, manutenção e trocas."
      actions={
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={emAberto}
            onChange={(e) => setEmAberto(e.target.checked)}
          />
          Só períodos abertos
        </label>
      }
    >
      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError
              ? query.error.message
              : "Falha ao listar locações."
          }
        />
      ) : null}

      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(l) => l.id}
        columns={[
          { key: "tipo", header: "Tipo", render: (l) => l.tipo ?? "—" },
          {
            key: "placa",
            header: "Placa",
            render: (l) => formatPlaca(l.placa),
          },
          { key: "inicio", header: "Início", render: (l) => l.inicio ?? "—" },
          { key: "fim", header: "Fim", render: (l) => l.fim ?? "Em aberto" },
          { key: "cliente", header: "Cliente", render: (l) => l.clienteId ?? "—" },
        ]}
      />
    </PageHeader>
  );
}
