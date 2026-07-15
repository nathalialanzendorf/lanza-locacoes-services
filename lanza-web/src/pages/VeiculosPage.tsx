import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { useVeiculos } from "@/api/hooks";
import { LanzaApiError } from "@/api/client";
import { formatPlaca, statusClass, statusLabel } from "@/lib/format";

type Filtro = "ativos" | "todos";

export function VeiculosPage() {
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [placa, setPlaca] = useState("");
  const query = useVeiculos({
    ativo: filtro === "ativos" ? true : undefined,
    placa: placa.trim() || undefined,
  });

  return (
    <PageHeader
      title="Veículos"
      description="Frota com placa, UF de registro e vínculo ao cliente."
      actions={
        <>
          <input
            className="input"
            placeholder="Filtrar placa"
            value={placa}
            onChange={(e) => setPlaca(e.target.value)}
          />
          <select
            className="select"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as Filtro)}
          >
            <option value="ativos">Só ativos</option>
            <option value="todos">Todos</option>
          </select>
        </>
      }
    >
      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError
              ? query.error.message
              : "Falha ao listar veículos."
          }
        />
      ) : null}

      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(v) => v.id}
        columns={[
          {
            key: "placa",
            header: "Placa",
            render: (v) => <strong>{formatPlaca(v.placa)}</strong>,
          },
          { key: "modelo", header: "Marca / modelo", render: (v) => v.marcaModelo ?? "—" },
          { key: "uf", header: "UF", render: (v) => v.ufRegistro ?? "SC" },
          {
            key: "ativo",
            header: "Status",
            render: (v) => (
              <span className={statusClass(v.ativo)}>{statusLabel(v.ativo)}</span>
            ),
          },
          {
            key: "cliente",
            header: "Cliente vinculado",
            render: (v) => v.clienteVinculadoId ?? "—",
          },
        ]}
      />
    </PageHeader>
  );
}
