import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useContratos, useParceiros, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";
import type { Contrato } from "@/api/types";

type FiltroStatus = "ativo" | "encerrado" | "todos";

function terminoContrato(contrato: Contrato): string {
  if (contrato.dataEncerramento?.trim()) return contrato.dataEncerramento;
  if (contrato.dataFimPrevista?.trim()) return contrato.dataFimPrevista;
  return contrato.dataFim ?? "—";
}

function veiculoUuid(contrato: Contrato, placaParaId: Map<string, string>): string | undefined {
  const idSnapshot = contrato.veiculo?.id;
  if (idSnapshot) return idSnapshot;
  const placa = contrato.placa ?? contrato.veiculo?.placa;
  if (!placa) return undefined;
  return placaParaId.get(placa.trim().toUpperCase());
}

export function ContratosListSection() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<FiltroStatus>("ativo");
  const [clienteId, setClienteId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const query = useContratos({
    status: status === "todos" ? undefined : status,
    clienteId: clienteId || undefined,
    veiculoId: veiculoId || undefined,
  });
  const parceirosQuery = useParceiros();
  const vinculosQuery = useVinculosParceiro();
  const veiculosQuery = useVeiculos();

  const rows = query.data?.items ?? [];
  const temFiltro = status !== "ativo" || Boolean(clienteId || veiculoId);

  const parceiroPorVeiculoId = useMemo(() => {
    const nomes = new Map((parceirosQuery.data?.items ?? []).map((p) => [p.id, p.nome]));
    const map = new Map<string, string>();
    for (const v of vinculosQuery.data?.items ?? []) {
      const nome = nomes.get(v.parceiroId);
      if (nome) map.set(v.veiculoId, nome);
    }
    return map;
  }, [parceirosQuery.data, vinculosQuery.data]);

  const placaParaVeiculoId = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of veiculosQuery.data?.items ?? []) {
      if (v.placa) map.set(v.placa.trim().toUpperCase(), v.id);
    }
    return map;
  }, [veiculosQuery.data]);

  function parceiroDoContrato(contrato: Contrato): string {
    const id = veiculoUuid(contrato, placaParaVeiculoId);
    if (!id) return "—";
    return parceiroPorVeiculoId.get(id) ?? "—";
  }

  async function excluir(contrato: Contrato) {
    const label = contrato.clienteNome ?? formatPlaca(contrato.placa) ?? contrato.id;
    if (!window.confirm(`Excluir o contrato "${label}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(contrato.id);
    try {
      await lanzaApi.removerContrato(contrato.id);
      void qc.invalidateQueries({ queryKey: ["contratos"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir contrato.");
    } finally {
      setExcluindoId(null);
    }
  }

  const loadingExtra =
    parceirosQuery.isLoading || vinculosQuery.isLoading || veiculosQuery.isLoading;

  return (
    <>
      <ListToolbar addTo="/contratos/cadastrar">
        <select
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value as FiltroStatus)}
          aria-label="Status"
        >
          <option value="ativo">Ativos</option>
          <option value="encerrado">Encerrados</option>
          <option value="todos">Todos</option>
        </select>
        <VeiculoSelect
          value={veiculoId}
          onChange={setVeiculoId}
          valueField="id"
          emptyLabel="Todos os veículos"
        />
        <ClienteSelect value={clienteId} onChange={setClienteId} emptyLabel="Todos os clientes" />
        {!query.isLoading ? (
          <span className="badge badge--muted">
            {rows.length} contrato{rows.length === 1 ? "" : "s"}
          </span>
        ) : null}
        <Link to="/contratos/encerrar" className="btn btn--ghost btn--sm">
          Encerrar
        </Link>
      </ListToolbar>
      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar contratos."}
        />
      ) : null}
      <DataTable
        loading={query.isLoading || loadingExtra}
        rows={rows}
        keyFn={(c) => c.id}
        emptyMessage={temFiltro ? "Nenhum contrato corresponde aos filtros." : "Nenhum contrato registado."}
        columns={[
          {
            key: "placa",
            header: "Placa",
            render: (c) => <strong>{formatPlaca(c.placa ?? c.veiculo?.placa)}</strong>,
          },
          {
            key: "marcaModelo",
            header: "Marca / modelo",
            render: (c) => c.veiculo?.marcaModelo ?? "—",
          },
          {
            key: "ano",
            header: "Ano",
            render: (c) => c.veiculo?.anoModelo ?? "—",
          },
          {
            key: "parceiro",
            header: "Parceiro",
            render: (c) => parceiroDoContrato(c),
          },
          {
            key: "status",
            header: "Status",
            render: (c) => (
              <span className={c.status === "ativo" ? "badge badge--ok" : "badge badge--muted"}>
                {c.status ?? "—"}
              </span>
            ),
          },
          { key: "inicio", header: "Início", render: (c) => c.dataInicio ?? "—" },
          { key: "termino", header: "Término", render: (c) => terminoContrato(c) },
          {
            key: "acoes",
            header: "Ações",
            className: "col-acoes",
            render: (c) => (
              <RowActions
                editTo={`/contratos/${c.id}/editar`}
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
