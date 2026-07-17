import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useClientes, useContratos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca, statusClass, statusLabel } from "@/lib/format";
import type { Cliente, Contrato } from "@/api/types";

type Filtro = "todos" | "ativos" | "inativos";

function formatCnh(cnh: Cliente["cnh"]): string {
  if (!cnh) return "—";
  if (typeof cnh === "string") return cnh;
  if (typeof cnh === "object" && "numeroRegistro" in cnh) {
    return String(cnh.numeroRegistro ?? "—");
  }
  return "—";
}

function normCpf(cpf?: string | null): string {
  return (cpf ?? "").replace(/\D/g, "");
}

function veiculoDoContrato(contrato: Contrato): string {
  const placa = formatPlaca(contrato.placa ?? contrato.veiculo?.placa);
  const modelo = contrato.veiculo?.marcaModelo?.trim();
  return modelo ? `${placa} — ${modelo}` : placa;
}

export function ClientesListSection() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [nome, setNome] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const ativo = filtro === "ativos" ? true : filtro === "inativos" ? false : undefined;
  const query = useClientes(ativo);
  const contratosQuery = useContratos({ status: "ativo" });

  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    const q = nome.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => (c.nome ?? "").toLowerCase().includes(q));
  }, [query.data, nome]);

  const { porClienteId, porCpf } = useMemo(() => {
    const porClienteId = new Map<string, Contrato>();
    const porCpf = new Map<string, Contrato>();
    for (const c of contratosQuery.data?.items ?? []) {
      if (c.clienteId) porClienteId.set(c.clienteId, c);
      const cpf = normCpf(c.cpf);
      if (cpf) porCpf.set(cpf, c);
    }
    return { porClienteId, porCpf };
  }, [contratosQuery.data]);

  function contratoAtivo(cliente: Cliente): Contrato | undefined {
    return porClienteId.get(cliente.id) ?? porCpf.get(normCpf(cliente.cpf));
  }

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
      <ListToolbar addTo="/clientes/novo">
        <input
          className="input"
          placeholder="Filtrar nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)} aria-label="Status">
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        {!query.isLoading ? (
          <span className="badge badge--muted">
            {rows.length} cliente{rows.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </ListToolbar>
      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar clientes."}
        />
      ) : null}
      <DataTable
        loading={query.isLoading || contratosQuery.isLoading}
        rows={rows}
        keyFn={(c) => c.id}
        columns={[
          { key: "nome", header: "Nome", render: (c) => c.nome ?? "—" },
          { key: "cpf", header: "CPF", render: (c) => c.cpf ?? "—" },
          { key: "cnh", header: "CNH", render: (c) => formatCnh(c.cnh) },
          {
            key: "contratoAtivo",
            header: "Contrato ativo",
            render: (c) => {
              const tem = Boolean(contratoAtivo(c));
              return (
                <span className={tem ? "badge badge--ok" : "badge badge--muted"}>{tem ? "Sim" : "Não"}</span>
              );
            },
          },
          {
            key: "veiculoContrato",
            header: "Veículo",
            render: (c) => {
              const contrato = contratoAtivo(c);
              return contrato ? veiculoDoContrato(contrato) : "—";
            },
          },
          {
            key: "status",
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
            className: "col-acoes",
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
