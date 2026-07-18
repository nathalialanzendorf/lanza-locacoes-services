import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ListToolbar } from "@/components/ListToolbar";
import { QueryError } from "@/components/PageHeader";
import { RowActions } from "@/components/RowActions";
import { useParceiros, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca, statusClass, statusLabel } from "@/lib/format";
import { ordenarAtivoDepoisAlfabetico, registroAtivo, rowClassInativo } from "@/lib/listagemCadastro";
import type { Parceiro } from "@/api/types";

type Filtro = "ativos" | "inativos" | "todos";

type ParceiroLinha = Parceiro & {
  veiculos: number;
  placas: string[];
};

export function ParceirosListSection() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [nome, setNome] = useState("");
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [inativandoId, setInativandoId] = useState<string | null>(null);
  const ativo = filtro === "ativos" ? true : filtro === "inativos" ? false : undefined;
  const parceirosQuery = useParceiros(ativo);
  const vinculosQuery = useVinculosParceiro();
  const veiculosQuery = useVeiculos();

  const loading = parceirosQuery.isLoading || vinculosQuery.isLoading || veiculosQuery.isLoading;

  const linhas = useMemo(() => {
    const placaPorVeiculoId = new Map(
      (veiculosQuery.data?.items ?? []).map((v) => [v.id, formatPlaca(v.placa)]),
    );
    const vinculosPorParceiro = new Map<string, string[]>();

    for (const v of vinculosQuery.data?.items ?? []) {
      const placas = vinculosPorParceiro.get(v.parceiroId) ?? [];
      const placa = placaPorVeiculoId.get(v.veiculoId) ?? v.veiculoId.slice(0, 8);
      placas.push(placa);
      vinculosPorParceiro.set(v.parceiroId, placas);
    }

    const termo = nome.trim().toLowerCase();

    const mapped = (parceirosQuery.data?.items ?? [])
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .map((p) => {
        const placas = vinculosPorParceiro.get(p.id) ?? [];
        return {
          ...p,
          veiculos: placas.length,
          placas: placas.sort((a, b) => a.localeCompare(b, "pt-BR")),
        } satisfies ParceiroLinha;
      });

    return ordenarAtivoDepoisAlfabetico(mapped, {
      ativoDe: (p) => registroAtivo(p.ativo),
      rotuloDe: (p) => p.nome,
    });
  }, [nome, parceirosQuery.data, vinculosQuery.data, veiculosQuery.data]);

  const temFiltro = Boolean(nome.trim() || filtro !== "todos");

  const erro = parceirosQuery.error ?? vinculosQuery.error ?? veiculosQuery.error ?? null;

  async function inativar(parceiro: ParceiroLinha) {
    if (!window.confirm(`Inativar o parceiro "${parceiro.nome}"?`)) return;
    setInativandoId(parceiro.id);
    try {
      await lanzaApi.atualizarParceiro(parceiro.id, { ativo: false });
      void qc.invalidateQueries({ queryKey: ["parceiros"] });
      void qc.invalidateQueries({ queryKey: ["resumo"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao inativar parceiro.");
    } finally {
      setInativandoId(null);
    }
  }

  async function excluir(parceiro: ParceiroLinha) {
    if (!window.confirm(`Excluir o parceiro "${parceiro.nome}"? Esta ação não pode ser desfeita.`)) return;
    setExcluindoId(parceiro.id);
    try {
      await lanzaApi.removerParceiro(parceiro.id);
      void qc.invalidateQueries({ queryKey: ["parceiros"] });
      void qc.invalidateQueries({ queryKey: ["parceiros-vinculos"] });
    } catch (err) {
      window.alert(err instanceof LanzaApiError ? err.message : "Falha ao excluir parceiro.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <>
      <ListToolbar addTo="/parceiros/novo">
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
        {!loading ? (
          <span className="badge badge--muted">
            {linhas.length} parceiro{linhas.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </ListToolbar>

      {erro ? (
        <QueryError message={erro instanceof LanzaApiError ? erro.message : "Falha ao listar parceiros."} />
      ) : null}

      <DataTable
        loading={loading}
        rows={linhas}
        keyFn={(p) => p.id}
        rowClassName={(p) => rowClassInativo(registroAtivo(p.ativo))}
        emptyMessage={temFiltro ? "Nenhum parceiro corresponde aos filtros." : "Nenhum parceiro registado."}
        columns={[
          { key: "nome", header: "Nome", render: (p) => <strong>{p.nome}</strong> },
          {
            key: "veiculos",
            header: "Veículos",
            render: (p) => (
              <span className={p.veiculos > 0 ? "badge badge--ok" : "badge badge--muted"}>{p.veiculos}</span>
            ),
          },
          {
            key: "placas",
            header: "Placas vinculadas",
            render: (p) =>
              p.placas.length > 0 ? <span className="parceiros-placas">{p.placas.join(" · ")}</span> : "—",
          },
          {
            key: "status",
            header: "Status",
            render: (p) => <span className={statusClass(p.ativo)}>{statusLabel(p.ativo)}</span>,
          },
          {
            key: "acoes",
            header: "Ações",
            className: "col-acoes",
            render: (p) => (
              <RowActions
                editTo={`/parceiros/${p.id}/editar`}
                onInativar={
                  registroAtivo(p.ativo) ? () => void inativar(p) : undefined
                }
                inactivating={inativandoId === p.id}
                deleting={excluindoId === p.id}
                onDelete={() => void excluir(p)}
              />
            ),
          },
        ]}
      />
    </>
  );
}
