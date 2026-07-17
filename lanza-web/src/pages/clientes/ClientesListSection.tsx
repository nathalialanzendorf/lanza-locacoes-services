import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useClientes } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { statusClass, statusLabel } from "@/lib/format";
import type { Cliente } from "@/api/types";

type Filtro = "todos" | "ativos" | "inativos";

function formatCnh(cnh: Cliente["cnh"]): string {
  if (!cnh) return "—";
  if (typeof cnh === "string") return cnh;
  if (typeof cnh === "object" && "numeroRegistro" in cnh) {
    return String(cnh.numeroRegistro ?? "—");
  }
  return "—";
}

export function ClientesListSection() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const ativo = filtro === "ativos" ? true : filtro === "inativos" ? false : undefined;
  const query = useClientes(ativo);

  async function excluir(cliente: Cliente) {
    const nome = cliente.nome ?? cliente.id;
    if (!window.confirm(`Excluir o cliente "${nome}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(cliente.id);
    try {
      await lanzaApi.removerCliente(cliente.id);
      void qc.invalidateQueries({ queryKey: ["clientes"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir cliente.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <>
      <ListToolbar addTo="/clientes/novo" addLabel="Adicionar cliente">
        <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
          <option value="ativos">Só ativos</option>
          <option value="inativos">Só inativos</option>
          <option value="todos">Todos</option>
        </select>
        <Link to="/clientes/importar-lote" className="btn btn--ghost btn--sm">
          Importar lote CNH
        </Link>
      </ListToolbar>
      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar clientes."}
        />
      ) : null}
      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(c) => c.id}
        columns={[
          { key: "nome", header: "Nome", render: (c) => c.nome ?? "—" },
          { key: "cpf", header: "CPF", render: (c) => c.cpf ?? "—" },
          { key: "cnh", header: "CNH", render: (c) => formatCnh(c.cnh) },
          {
            key: "ativo",
            header: "Status",
            render: (c) => <span className={statusClass(c.ativo)}>{statusLabel(c.ativo)}</span>,
          },
          {
            key: "analise",
            header: "Análise",
            render: (c) => {
              const a = c.analiseCadastro?.aprovado;
              if (a === true) return <span className="badge badge--ok">Aprovado</span>;
              if (a === false) return <span className="badge badge--danger">Reprovado</span>;
              return <span className="badge badge--muted">Pendente</span>;
            },
          },
          {
            key: "acoes",
            header: "Ações",
            render: (c) => (
              <RowActions
                editTo={`/clientes/${c.id}/editar`}
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
