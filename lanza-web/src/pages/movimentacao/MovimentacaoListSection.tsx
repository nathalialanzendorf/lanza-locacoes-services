import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useClientes, useLocacoes, useParceiros, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";
import { clienteNomeDe } from "@/lib/clienteCampo";
import type { Locacao, Veiculo } from "@/api/types";

function normPlaca(placa?: string | null): string {
  return (placa ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function MovimentacaoListSection() {
  const qc = useQueryClient();
  const [emAberto, setEmAberto] = useState(true);
  const [placa, setPlaca] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const query = useLocacoes({
    abertas: emAberto ? true : undefined,
    placa: placa.trim() || undefined,
  });
  const clientesQuery = useClientes();
  const veiculosQuery = useVeiculos();
  const parceirosQuery = useParceiros();
  const vinculosQuery = useVinculosParceiro();

  const nomesCliente = useMemo(
    () =>
      new Map(
        (clientesQuery.data?.items ?? [])
          .filter((c) => c.nome)
          .map((c) => [c.id, c.nome!]),
      ),
    [clientesQuery.data],
  );

  const veiculoPorId = useMemo(() => {
    const map = new Map<string, Veiculo>();
    for (const v of veiculosQuery.data?.items ?? []) {
      map.set(v.id, v);
    }
    return map;
  }, [veiculosQuery.data]);

  const veiculoPorPlaca = useMemo(() => {
    const map = new Map<string, Veiculo>();
    for (const v of veiculosQuery.data?.items ?? []) {
      if (v.placa) map.set(normPlaca(v.placa), v);
    }
    return map;
  }, [veiculosQuery.data]);

  const parceiroPorVeiculoId = useMemo(() => {
    const nomes = new Map((parceirosQuery.data?.items ?? []).map((p) => [p.id, p.nome]));
    const map = new Map<string, string>();
    for (const v of vinculosQuery.data?.items ?? []) {
      const nome = nomes.get(v.parceiroId);
      if (nome) map.set(v.veiculoId, nome);
    }
    return map;
  }, [parceirosQuery.data, vinculosQuery.data]);

  function veiculoDaLocacao(locacao: Locacao): Veiculo | undefined {
    if (locacao.veiculoId && veiculoPorId.has(locacao.veiculoId)) {
      return veiculoPorId.get(locacao.veiculoId);
    }
    if (locacao.placa) return veiculoPorPlaca.get(normPlaca(locacao.placa));
    return undefined;
  }

  function parceiroDaLocacao(locacao: Locacao): string {
    const veiculo = veiculoDaLocacao(locacao);
    if (!veiculo) return "—";
    return parceiroPorVeiculoId.get(veiculo.id) ?? "—";
  }

  function clienteDaLocacao(locacao: Locacao): string {
    if (locacao.clienteId && nomesCliente.has(locacao.clienteId)) {
      return nomesCliente.get(locacao.clienteId)!;
    }
    const nome = clienteNomeDe(locacao);
    if (nome?.trim()) return nome.trim();
    return "—";
  }

  async function excluir(locacao: Locacao) {
    const label = `${locacao.situacao ?? "movimentação"} · ${formatPlaca(locacao.placa)}`;
    if (!window.confirm(`Excluir ${label}? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(locacao.id);
    try {
      await lanzaApi.removerLocacao(locacao.id);
      void qc.invalidateQueries({ queryKey: ["locacoes"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir movimentação.");
    } finally {
      setExcluindoId(null);
    }
  }

  const loadingExtra =
    clientesQuery.isLoading ||
    veiculosQuery.isLoading ||
    parceirosQuery.isLoading ||
    vinculosQuery.isLoading;

  return (
    <>
      <ListToolbar addTo="/movimentacao/novo">
        <input
          className="input"
          placeholder="Filtrar placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
        <label className="checkbox-label">
          <input type="checkbox" checked={emAberto} onChange={(e) => setEmAberto(e.target.checked)} />
          Só períodos abertos
        </label>
      </ListToolbar>
      {query.isError ? (
        <QueryError
          message={query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar movimentações."}
        />
      ) : null}
      <DataTable
        loading={query.isLoading || loadingExtra}
        rows={query.data?.items ?? []}
        keyFn={(l) => l.id}
        columns={[
          { key: "placa", header: "Placa", render: (l) => <strong>{formatPlaca(l.placa)}</strong> },
          {
            key: "marcaModelo",
            header: "Marca / modelo",
            render: (l) => veiculoDaLocacao(l)?.marcaModelo ?? "—",
          },
          {
            key: "ano",
            header: "Ano",
            render: (l) => veiculoDaLocacao(l)?.anoModelo ?? "—",
          },
          { key: "parceiro", header: "Parceiro", render: (l) => parceiroDaLocacao(l) },
          { key: "situacao", header: "Situação", render: (l) => l.situacao ?? l.tipo ?? "—" },
          { key: "inicio", header: "Início", render: (l) => l.inicio ?? "—" },
          { key: "fim", header: "Fim", render: (l) => l.fim ?? "Em aberto" },
          { key: "cliente", header: "Cliente", render: (l) => clienteDaLocacao(l) },
          {
            key: "acoes",
            header: "Ações",
            className: "col-acoes",
            render: (l) => (
              <RowActions
                editTo={`/movimentacao/${l.id}/editar`}
                deleting={excluindoId === l.id}
                onDelete={() => void excluir(l)}
              />
            ),
          },
        ]}
      />
    </>
  );
}
