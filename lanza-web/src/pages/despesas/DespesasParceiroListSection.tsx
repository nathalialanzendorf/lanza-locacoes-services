import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useDespesasParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatPlaca } from "@/lib/format";
import type { ParceiroDespesa } from "@/api/types";

export function DespesasParceiroListSection() {
  const qc = useQueryClient();
  const [emAberto, setEmAberto] = useState(true);
  const [placa, setPlaca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const query = useDespesasParceiro({
    emAberto,
    placa: placa.trim() || undefined,
    categoria: categoria.trim() || undefined,
    competencia: competencia.trim() || undefined,
  });

  const total = useMemo(
    () => (query.data?.items ?? []).reduce((sum, d) => sum + (Number(d.valor) || 0), 0),
    [query.data],
  );

  async function excluir(despesa: ParceiroDespesa) {
    const label = despesa.descricao ?? despesa.categoria ?? despesa.id;
    if (!window.confirm(`Excluir a despesa "${label}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(despesa.id);
    try {
      await lanzaApi.removerParceiroDespesa(despesa.id);
      void qc.invalidateQueries({ queryKey: ["despesas-parceiro"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir despesa.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <>
      <ListToolbar addTo="/despesas/parceiro/novo">
        <input className="input" placeholder="Filtrar placa" value={placa} onChange={(e) => setPlaca(e.target.value)} />
        <input
          className="input"
          placeholder="Categoria"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />
        <input
          className="input"
          placeholder="Competência (MM/AAAA)"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
        />
        <label className="checkbox-label">
          <input type="checkbox" checked={emAberto} onChange={(e) => setEmAberto(e.target.checked)} />
          Só em aberto
        </label>
        <Link to="/despesas/parceiro/operacoes" className="btn btn--ghost btn--sm">
          Baixa / rastreador
        </Link>
        {!query.isLoading ? (
          <span className="badge badge--muted">
            {query.data?.total ?? 0} lançamento{(query.data?.total ?? 0) === 1 ? "" : "s"} · {formatBrl(total)}
          </span>
        ) : null}
      </ListToolbar>

      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar despesas do parceiro."
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
          { key: "placa", header: "Placa", render: (d) => formatPlaca(d.placa) },
          { key: "competencia", header: "Competência", render: (d) => d.competencia ?? "—" },
          { key: "data", header: "Vencimento", render: (d) => d.data ?? "—" },
          {
            key: "valor",
            header: "Valor",
            className: "num",
            render: (d) => formatBrl(Number(d.valor) || 0),
          },
          {
            key: "baixa",
            header: "Baixa",
            render: (d) => {
              const quitada = Boolean(d.baixa?.trim());
              return (
                <span className={quitada ? "badge badge--ok" : "badge badge--warn"}>
                  {quitada ? d.baixa : "Em aberto"}
                </span>
              );
            },
          },
          {
            key: "acoes",
            header: "Ações",
            render: (d) => (
              <RowActions
                editTo={`/despesas/parceiro/${d.id}/editar`}
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
