import { useMemo, useState } from "react";
import { DataTable } from "@/components/DataTable";
import { QueryError } from "@/components/PageHeader";
import { ResultPanel } from "@/components/ResultPanel";
import { useClientes, useInfracoes } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatPlaca } from "@/lib/format";
import {
  clienteConfirmadoDe,
  clienteIdDe,
  clienteNaoIdentificadoDe,
} from "@/lib/clienteCampo";
import type { Infracao } from "@/api/types";

function valorInfracao(i: Infracao): number {
  return Number(i.valorMulta ?? i.valor) || 0;
}

function clienteLabel(
  i: Infracao,
  nomes: Map<string, string>,
): { text: string; className: string } {
  if (i.debitoParceiroConfirmado) {
    return { text: "Débito parceiro", className: "badge badge--muted" };
  }
  const id = clienteIdDe(i);
  if (id) {
    const nome = nomes.get(id);
    return {
      text: nome ?? id.slice(0, 8),
      className: clienteConfirmadoDe(i) ? "badge badge--ok" : "badge badge--warn",
    };
  }
  if (clienteNaoIdentificadoDe(i)) {
    return { text: "Não identificado", className: "badge badge--muted" };
  }
  if (i.revisarManual) {
    return { text: "Revisar", className: "badge badge--warn" };
  }
  return { text: "Sem cliente", className: "badge badge--danger" };
}

function situacaoLabel(i: Infracao): { text: string; className: string } {
  if (i.quitadaDetran) {
    return { text: "Quitada DETRAN", className: "badge badge--ok" };
  }
  const raw = i.situacao ?? i.status ?? "";
  if (/quitad|pago|paga/i.test(raw)) {
    return { text: raw, className: "badge badge--ok" };
  }
  if (/aberto|notificad|autua/i.test(raw)) {
    return { text: raw || "Em aberto", className: "badge badge--warn" };
  }
  return { text: raw || "—", className: "badge badge--muted" };
}

export function RelatorioInfracoesSection() {
  const [emAberto, setEmAberto] = useState(true);
  const [semCliente, setSemCliente] = useState(false);
  const [placa, setPlaca] = useState("");
  const [atribuirLoading, setAtribuirLoading] = useState(false);
  const [atribuirResult, setAtribuirResult] = useState<unknown>(null);
  const [atribuirError, setAtribuirError] = useState<string | null>(null);

  const query = useInfracoes({
    emAberto,
    semCliente: semCliente || undefined,
    placa: placa.trim() || undefined,
    ativo: true,
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

  const total = useMemo(
    () => (query.data?.items ?? []).reduce((sum, i) => sum + valorInfracao(i), 0),
    [query.data],
  );

  const loading = query.isLoading || clientesQuery.isLoading;

  async function atribuirClientes(dryRun: boolean) {
    setAtribuirLoading(true);
    setAtribuirError(null);
    try {
      const r = await lanzaApi.atribuirClientesInfracoes({
        dryRun,
        placa: placa.trim() || undefined,
      });
      setAtribuirResult(r);
    } catch (err) {
      setAtribuirError(err instanceof LanzaApiError ? err.message : "Falha ao atribuir clientes.");
    } finally {
      setAtribuirLoading(false);
    }
  }

  return (
    <>
      {!loading ? (
        <p className="relatorio-infracoes__resumo">
          <span className="badge badge--muted">
            {query.data?.total ?? 0} registo{(query.data?.total ?? 0) === 1 ? "" : "s"} ·{" "}
            {formatBrl(total)}
          </span>
        </p>
      ) : null}

      <div className="despesas-toolbar">
        <input
          className="input"
          placeholder="Filtrar placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={emAberto}
            onChange={(e) => setEmAberto(e.target.checked)}
          />
          Só em aberto
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={semCliente}
            onChange={(e) => setSemCliente(e.target.checked)}
          />
          Sem cliente
        </label>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={atribuirLoading}
          onClick={() => void atribuirClientes(true)}
        >
          Preview atribuir clientes
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={atribuirLoading}
          onClick={() => void atribuirClientes(false)}
        >
          Atribuir clientes
        </button>
      </div>

      {atribuirError ? <p className="form-card__error">{atribuirError}</p> : null}
      <ResultPanel title="Atribuição de clientes" data={atribuirResult} />

      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError
              ? query.error.message
              : "Falha ao listar infrações."
          }
        />
      ) : null}

      <DataTable
        loading={loading}
        rows={query.data?.items ?? []}
        keyFn={(i) => i.id}
        emptyMessage="Nenhuma infração encontrada para os filtros selecionados."
        columns={[
          {
            key: "auto",
            header: "Auto",
            render: (i) => <strong>{i.numeroAuto}</strong>,
          },
          {
            key: "placa",
            header: "Placa",
            render: (i) => formatPlaca(i.veiculoId),
          },
          {
            key: "desc",
            header: "Descrição",
            render: (i) => (
              <span className="infracao-desc" title={i.descricao}>
                {i.descricao ?? "—"}
              </span>
            ),
          },
          {
            key: "data",
            header: "Autuação",
            render: (i) => i.dataAutuacao?.slice(0, 16) ?? "—",
          },
          {
            key: "valor",
            header: "Valor",
            className: "num",
            render: (i) => formatBrl(valorInfracao(i)),
          },
          {
            key: "situacao",
            header: "Situação",
            render: (i) => {
              const s = situacaoLabel(i);
              return <span className={s.className}>{s.text}</span>;
            },
          },
          {
            key: "cliente",
            header: "Cliente",
            render: (i) => {
              const c = clienteLabel(i, nomesCliente);
              return <span className={c.className}>{c.text}</span>;
            },
          },
          {
            key: "despesa",
            header: "Despesa",
            render: (i) =>
              i.clienteDespesaId ? (
                <span className="badge badge--ok">Vinculada</span>
              ) : (
                <span className="badge badge--muted">—</span>
              ),
          },
        ]}
      />
    </>
  );
}
