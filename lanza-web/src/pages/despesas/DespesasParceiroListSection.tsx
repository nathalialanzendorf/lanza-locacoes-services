import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ParceiroSelect, VeiculoSelect } from "@/components/EntitySelects";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useDespesasParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatPlaca } from "@/lib/format";
import type { ParceiroDespesa } from "@/api/types";

const CATEGORIAS = [
  "Seguro",
  "Rastreador",
  "Manutenção",
  "IPVA",
  "Licenciamento",
  "Outros",
] as const;

type FiltroStatus = "ativos" | "inativos" | "todos";
type FiltroPagamento = "em_aberto" | "pago" | "todos";

export function DespesasParceiroListSection() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<FiltroStatus>("ativos");
  const [pagamento, setPagamento] = useState<FiltroPagamento>("em_aberto");
  const [parceiroId, setParceiroId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const query = useDespesasParceiro({
    ativo: status === "ativos" ? true : status === "inativos" ? false : undefined,
    emAberto: pagamento === "em_aberto" ? true : pagamento === "pago" ? false : undefined,
    parceiroId: parceiroId || undefined,
    veiculoId: veiculoId || undefined,
    categoria: categoria || undefined,
    competencia: competencia.trim() || undefined,
  });

  const rows = query.data?.items ?? [];
  const temFiltro =
    status !== "ativos" ||
    pagamento !== "em_aberto" ||
    Boolean(parceiroId || veiculoId || categoria || competencia.trim());

  const total = useMemo(
    () => rows.reduce((sum, d) => sum + (Number(d.valor) || 0), 0),
    [rows],
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
        <ParceiroSelect value={parceiroId} onChange={setParceiroId} emptyLabel="Todos os parceiros" />
        <VeiculoSelect
          value={veiculoId}
          onChange={setVeiculoId}
          valueField="id"
          emptyLabel="Todos os veículos"
        />
        <select
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value as FiltroStatus)}
          aria-label="Status"
        >
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        <select
          className="select"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Categoria"
        >
          <option value="">Todas</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="select"
          value={pagamento}
          onChange={(e) => setPagamento(e.target.value as FiltroPagamento)}
          aria-label="Pagamento"
        >
          <option value="em_aberto">Em aberto</option>
          <option value="pago">Pago</option>
          <option value="todos">Todos</option>
        </select>
        <input
          className="input"
          placeholder="Competência (MM/AAAA)"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
          aria-label="Competência"
        />
        <Link to="/despesas/parceiro/operacoes" className="btn btn--ghost btn--sm">
          Baixa / rastreador
        </Link>
        {!query.isLoading ? (
          <span className="badge badge--muted">
            {rows.length} lançamento{rows.length === 1 ? "" : "s"} · {formatBrl(total)}
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
        rows={rows}
        keyFn={(d) => d.id}
        emptyMessage={temFiltro ? "Nenhuma despesa corresponde aos filtros." : "Nenhuma despesa registada."}
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
            className: "col-acoes",
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
