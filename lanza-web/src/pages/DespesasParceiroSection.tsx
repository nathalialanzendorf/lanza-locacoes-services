import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { QueryError } from "@/components/PageHeader";
import { useDespesasParceiro } from "@/api/hooks";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatPlaca } from "@/lib/format";
import { DespesaParceiroActionsPanel } from "@/pages/DespesaParceiroActionsPanel";

export function DespesasParceiroSection() {
  const [emAberto, setEmAberto] = useState(true);
  const [placa, setPlaca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [mostrarOps, setMostrarOps] = useState(false);

  const query = useDespesasParceiro({
    emAberto,
    placa: placa.trim() || undefined,
    categoria: categoria.trim() || undefined,
    competencia: competencia.trim() || undefined,
  });

  const total = useMemo(
    () =>
      (query.data?.items ?? []).reduce((sum, d) => sum + (Number(d.valor) || 0), 0),
    [query.data],
  );

  return (
    <>
      <div className="despesas-toolbar">
        <input
          className="input"
          placeholder="Filtrar placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
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
          <input
            type="checkbox"
            checked={emAberto}
            onChange={(e) => setEmAberto(e.target.checked)}
          />
          Só em aberto
        </label>
        <button type="button" className="btn btn--ghost" onClick={() => setMostrarOps((v) => !v)}>
          {mostrarOps ? "Ocultar operações" : "Cadastro / baixa"}
        </button>
        {!query.isLoading ? (
          <span className="badge badge--muted">
            {query.data?.total ?? 0} lançamento{(query.data?.total ?? 0) === 1 ? "" : "s"} ·{" "}
            {formatBrl(total)}
          </span>
        ) : null}
      </div>

      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError
              ? query.error.message
              : "Falha ao listar despesas do parceiro."
          }
        />
      ) : null}

      {mostrarOps ? <DespesaParceiroActionsPanel /> : null}

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
            key: "competencia",
            header: "Competência",
            render: (d) => d.competencia ?? "—",
          },
          {
            key: "data",
            header: "Vencimento",
            render: (d) => d.data ?? "—",
          },
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
        ]}
      />
    </>
  );
}
