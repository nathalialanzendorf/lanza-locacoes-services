import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useDespesasCliente } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatPlaca } from "@/lib/format";
import type { ClienteDespesa } from "@/api/types";

function placaDespesa(d: ClienteDespesa): string {
  return formatPlaca(d.placa ?? d.veiculoId);
}

export function DespesasClienteListSection() {
  const qc = useQueryClient();
  const [emAberto, setEmAberto] = useState(true);
  const [placa, setPlaca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const query = useDespesasCliente({
    emAberto,
    placa: placa.trim() || undefined,
    categoria: categoria.trim() || undefined,
  });

  const total = useMemo(
    () => (query.data?.items ?? []).reduce((sum, d) => sum + (Number(d.valorMulta) || 0), 0),
    [query.data],
  );

  async function excluir(despesa: ClienteDespesa) {
    const label = despesa.descricao ?? despesa.categoria ?? despesa.id;
    if (!window.confirm(`Excluir a despesa "${label}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(despesa.id);
    try {
      await lanzaApi.removerDespesaCliente(despesa.id);
      void qc.invalidateQueries({ queryKey: ["despesas-cliente"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir despesa.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <>
      <ListToolbar addTo="/despesas/cliente/novo">
        <input className="input" placeholder="Filtrar placa" value={placa} onChange={(e) => setPlaca(e.target.value)} />
        <input
          className="input"
          placeholder="Categoria"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <label className="checkbox-label">
          <input type="checkbox" checked={emAberto} onChange={(e) => setEmAberto(e.target.checked)} />
          Só em aberto
        </label>
        <Link to="/despesas/cliente/renegociacao" className="btn btn--ghost btn--sm">
          Renegociar débitos
        </Link>
        {!query.isLoading ? (
          <span className="badge badge--muted">
            {query.data?.total ?? 0} lançamento{(query.data?.total ?? 0) === 1 ? "" : "s"} · {formatBrl(total)}
          </span>
        ) : null}
      </ListToolbar>

      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar débitos do cliente."}
        />
      ) : null}

      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(d) => d.id}
        columns={[
          { key: "categoria", header: "Categoria", render: (d) => d.categoria ?? "—" },
          { key: "desc", header: "Descrição", render: (d) => d.descricao ?? "—" },
          { key: "placa", header: "Placa", render: (d) => placaDespesa(d) },
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
              <span className={d.paga ? "badge badge--ok" : "badge badge--warn"}>{d.paga ? "Sim" : "Não"}</span>
            ),
          },
          {
            key: "ativo",
            header: "Ativa",
            render: (d) => (
              <span className={d.ativo === false ? "badge badge--muted" : "badge badge--ok"}>
                {d.ativo === false ? "Não" : "Sim"}
              </span>
            ),
          },
          {
            key: "acoes",
            header: "Ações",
            className: "col-acoes",
            render: (d) => (
              <RowActions
                editTo={`/despesas/cliente/${d.id}/editar`}
                deleting={excluindoId === d.id}
                onDelete={() => void excluir(d)}
              />
            ),
          },
        ]}
      />
    </>
  );
}
