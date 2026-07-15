import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { useClientes } from "@/api/hooks";
import { LanzaApiError } from "@/api/client";
import { statusClass, statusLabel } from "@/lib/format";

type Filtro = "todos" | "ativos" | "inativos";

export function ClientesPage() {
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const ativo =
    filtro === "ativos" ? true : filtro === "inativos" ? false : undefined;
  const query = useClientes(ativo);

  return (
    <PageHeader
      title="Clientes"
      description="Motoristas e locatários registados na base local."
      actions={
        <select
          className="select"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as Filtro)}
        >
          <option value="ativos">Só ativos</option>
          <option value="inativos">Só inativos</option>
          <option value="todos">Todos</option>
        </select>
      }
    >
      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError
              ? query.error.message
              : "Falha ao listar clientes."
          }
        />
      ) : null}

      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(c) => c.id}
        columns={[
          { key: "nome", header: "Nome", render: (c) => c.nome ?? "—" },
          { key: "cpf", header: "CPF", render: (c) => c.cpf ?? "—" },
          {
            key: "ativo",
            header: "Status",
            render: (c) => (
              <span className={statusClass(c.ativo)}>{statusLabel(c.ativo)}</span>
            ),
          },
          {
            key: "analise",
            header: "Análise cadastro",
            render: (c) => {
              const a = c.analiseCadastro?.aprovado;
              if (a === true) return <span className="badge badge--ok">Aprovado</span>;
              if (a === false) return <span className="badge badge--danger">Reprovado</span>;
              return <span className="badge badge--muted">Pendente</span>;
            },
          },
        ]}
      />
    </PageHeader>
  );
}
