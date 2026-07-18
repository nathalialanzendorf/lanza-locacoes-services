import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ParceiroSelect, VeiculoSelect, NativeSelect } from "@/components/EntitySelects";
import { SELECT_LABEL_TODOS } from "@/lib/selectLabels";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useDespesasParceiro, useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatVeiculoLabel } from "@/lib/format";
import type { ParceiroDespesa, Veiculo } from "@/api/types";

const CATEGORIAS = [
  "Seguro",
  "Rastreador",
  "Manutenção",
  "IPVA",
  "Licenciamento",
  "Outros",
] as const;

type FiltroPagamento = "em_aberto" | "pago" | "todos";

function compactPlaca(placa: string | null | undefined): string {
  return (placa ?? "").replace(/-/g, "").trim().toUpperCase();
}

function veiculoDespesa(d: ParceiroDespesa, veiculos: Veiculo[] | undefined): string {
  const placaKey = compactPlaca(d.placa ?? d.veiculoId ?? undefined);
  const v = veiculos?.find(
    (x) => x.id === d.veiculoId || compactPlaca(x.placa) === placaKey,
  );
  if (v) return formatVeiculoLabel(v);
  return formatVeiculoLabel({ placa: d.placa ?? d.veiculoId ?? undefined });
}

export function DespesasParceiroListSection() {
  const qc = useQueryClient();
  const [pagamento, setPagamento] = useState<FiltroPagamento>("em_aberto");
  const [parceiroId, setParceiroId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  const query = useDespesasParceiro({
    emAberto: pagamento === "em_aberto" ? true : pagamento === "pago" ? false : undefined,
    parceiroId: parceiroId || undefined,
    veiculoId: veiculoId || undefined,
    categoria: categoria || undefined,
    competencia: competencia.trim() || undefined,
  });
  const veiculosQuery = useVeiculos();
  const veiculos = veiculosQuery.data?.items;

  const rows = query.data?.items ?? [];
  const temFiltro =
    pagamento !== "em_aberto" || Boolean(parceiroId || veiculoId || categoria || competencia.trim());

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
        <ParceiroSelect value={parceiroId} onChange={setParceiroId} variant="filtro" />
        <VeiculoSelect
          value={veiculoId}
          onChange={setVeiculoId}
          valueField="id"
          variant="filtro"
        />
        <NativeSelect
          value={categoria}
          onChange={setCategoria}
          variant="filtro"
          aria-label="Categoria"
        >
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={pagamento}
          onChange={(v) => setPagamento(v as FiltroPagamento)}
          variant="filtro"
          allowEmpty={false}
          aria-label="Pagamento"
        >
          <option value="em_aberto">Em aberto</option>
          <option value="pago">Pago</option>
          <option value="todos">{SELECT_LABEL_TODOS}</option>
        </NativeSelect>
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
          { key: "veiculo", header: "Veículo", render: (d) => veiculoDespesa(d, veiculos) },
          { key: "desc", header: "Descrição", render: (d) => d.descricao ?? "—" },
          { key: "categoria", header: "Categoria", render: (d) => d.categoria ?? "—" },
          { key: "vencimento", header: "Vencimento", render: (d) => d.data?.trim() || "—" },
          { key: "competencia", header: "Competência", render: (d) => d.competencia ?? "—" },
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
