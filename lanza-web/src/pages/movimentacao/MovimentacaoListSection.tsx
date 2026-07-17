import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useLocacoes, useClientes } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";
import type { Locacao } from "@/api/types";

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

  const nomesCliente = useMemo(
    () =>
      new Map(
        (clientesQuery.data?.items ?? [])
          .filter((c) => c.nome)
          .map((c) => [c.id, c.nome!]),
      ),
    [clientesQuery.data],
  );

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

  return (
    <>
      <ListToolbar addTo="/movimentacao/novo" addLabel="Adicionar movimentação">
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
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(l) => l.id}
        columns={[
          { key: "situacao", header: "Situação", render: (l) => l.situacao ?? l.tipo ?? "—" },
          { key: "placa", header: "Placa", render: (l) => formatPlaca(l.placa) },
          { key: "inicio", header: "Início", render: (l) => l.inicio ?? "—" },
          { key: "fim", header: "Fim", render: (l) => l.fim ?? "Em aberto" },
          {
            key: "condutor",
            header: "Cliente",
            render: (l) => {
              const id = l.clienteId;
              if (id && nomesCliente.has(id)) return nomesCliente.get(id);
              return l.condutor ?? id ?? "—";
            },
          },
          {
            key: "acoes",
            header: "Ações",
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
