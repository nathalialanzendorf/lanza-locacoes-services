import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import {
  PERIODO_VAZIO,
  RelatorioPeriodoFiltro,
  type RelatorioPeriodo,
} from "@/components/relatorios/RelatorioPeriodoFiltro";
import { useContratos, useClientes, useParceiros, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca, clienteExibicaoPorId } from "@/lib/format";
import { ordenarAtivoDepoisAlfabetico } from "@/lib/listagemCadastro";
import { periodoPreenchido } from "@/lib/periodoRelatorio";
import type { Contrato } from "@/api/types";

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
  const [clienteId, setClienteId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [periodo, setPeriodo] = useState<RelatorioPeriodo>(PERIODO_VAZIO);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const query = useContratos({
    clienteId: clienteId || undefined,
    veiculoId: veiculoId || undefined,
    dataInicial: periodo.dataInicial.trim() || undefined,
    dataFinal: periodo.dataFinal.trim() || undefined,
  });
  const parceirosQuery = useParceiros();
  const vinculosQuery = useVinculosParceiro();
  const veiculosQuery = useVeiculos();
  const clientesQuery = useClientes();

  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    return ordenarAtivoDepoisAlfabetico(items, {
      ativoDe: (c) => c.status === "ativo",
      rotuloDe: (c) => formatPlaca(c.placa ?? c.veiculo?.placa ?? c.id),
    });
  }, [query.data]);
  const temFiltro = Boolean(clienteId || veiculoId || periodoPreenchido(periodo));

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
    const nomeCli = clienteExibicaoPorId(
      clientesQuery.data?.items,
      contrato.clienteId,
      contrato.clienteNome,
    );
    const label = nomeCli !== "—" ? nomeCli : formatPlaca(contrato.placa) ?? contrato.id;
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
      <section className="form-card">
        <h2 className="form-card__title">Filtros</h2>
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Veículo</span>
            <VeiculoSelect
              value={veiculoId}
              onChange={setVeiculoId}
              valueField="id"
              variant="filtro"
            />
          </label>
          <label className="field">
            <span className="field__label">Cliente</span>
            <ClienteSelect value={clienteId} onChange={setClienteId} variant="filtro" />
          </label>
          <RelatorioPeriodoFiltro
            value={periodo}
            onChange={setPeriodo}
            hint="Contratos que intersectam o período (início / término previsto ou encerramento)"
          />
        </div>
        {!query.isLoading ? (
          <p className="field__hint">
            {rows.length} contrato{rows.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </section>

      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar contratos."}
        />
      ) : null}
      <DataTable
        loading={query.isLoading || loadingExtra}
        rows={rows}
        keyFn={(c) => c.id}
        rowClassName={(c) =>
          c.status === "ativo" ? undefined : "row--inativo row--inativo-amber"
        }
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
            key: "cliente",
            header: "Cliente",
            render: (c) =>
              clienteExibicaoPorId(clientesQuery.data?.items, c.clienteId, c.clienteNome),
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
              <span className={c.status === "ativo" ? "badge badge--ok" : "badge badge--amber"}>
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
                variant="contrato"
                editTo={`/contratos/${c.id}/editar`}
                renovarTo={c.status === "ativo" ? `/contratos/renovar?id=${encodeURIComponent(c.id)}` : undefined}
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
