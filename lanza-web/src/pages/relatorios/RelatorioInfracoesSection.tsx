import { useMemo, useState, type ReactNode } from "react";
import { DataTable } from "@/components/DataTable";
import { ClienteSelect, ParceiroSelect, VeiculoSelect } from "@/components/EntitySelects";
import { QueryError } from "@/components/PageHeader";
import { ResultPanel } from "@/components/ResultPanel";
import {
  PERIODO_VAZIO,
  RelatorioPeriodoFiltro,
  type RelatorioPeriodo,
} from "@/components/relatorios/RelatorioPeriodoFiltro";
import { useClientes, useInfracoes, useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatClienteLabel, formatPlaca } from "@/lib/format";
import {
  clienteConfirmadoDe,
  clienteIdDe,
  clienteNaoIdentificadoDe,
} from "@/lib/clienteCampo";
import { periodoPreenchido } from "@/lib/periodoRelatorio";
import type { Infracao } from "@/api/types";

type FiltroSituacao = "em_aberto" | "quitado" | "todos";

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
  const [veiculoId, setVeiculoId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [parceiroId, setParceiroId] = useState("");
  const [periodo, setPeriodo] = useState<RelatorioPeriodo>(PERIODO_VAZIO);
  const [situacao, setSituacao] = useState<FiltroSituacao>("em_aberto");
  const [atribuirLoading, setAtribuirLoading] = useState(false);
  const [atribuirResult, setAtribuirResult] = useState<unknown>(null);
  const [atribuirError, setAtribuirError] = useState<string | null>(null);

  const emAberto = situacao === "em_aberto" ? true : situacao === "quitado" ? false : undefined;

  const query = useInfracoes({
    veiculoId: veiculoId || undefined,
    clienteId: clienteId || undefined,
    parceiroId: parceiroId || undefined,
    dataInicial: periodo.dataInicial.trim() || undefined,
    dataFinal: periodo.dataFinal.trim() || undefined,
    emAberto,
    ativo: true,
  });
  const clientesQuery = useClientes();
  const veiculosQuery = useVeiculos({ ativo: true });

  const placaFiltro = useMemo(() => {
    if (!veiculoId) return undefined;
    return veiculosQuery.data?.items.find((v) => v.id === veiculoId)?.placa;
  }, [veiculoId, veiculosQuery.data]);

  const nomesCliente = useMemo(
    () =>
      new Map(
        (clientesQuery.data?.items ?? [])
          .filter((c) => c.nome)
          .map((c) => [c.id, formatClienteLabel(c)]),
      ),
    [clientesQuery.data],
  );

  const rows = query.data?.items ?? [];
  const temFiltro = Boolean(
    veiculoId || clienteId || parceiroId || situacao !== "em_aberto" || periodoPreenchido(periodo),
  );

  const total = useMemo(() => rows.reduce((sum, i) => sum + valorInfracao(i), 0), [rows]);

  const loading = query.isLoading || clientesQuery.isLoading;

  async function atribuirClientes(dryRun: boolean) {
    setAtribuirLoading(true);
    setAtribuirError(null);
    try {
      const r = await lanzaApi.atribuirClientesInfracoes({
        dryRun,
        placa: placaFiltro?.trim() || undefined,
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

      <section className="form-card">
        <h2 className="form-card__title">Filtros</h2>
        <div className="form-grid">
          <FieldLike label="Veículo">
            <VeiculoSelect
              value={veiculoId}
              onChange={setVeiculoId}
              valueField="id"
              ativo
              parceiroId={parceiroId || undefined}
              emptyLabel="Todos os veículos ativos"
            />
          </FieldLike>
          <FieldLike label="Cliente">
            <ClienteSelect
              value={clienteId}
              onChange={setClienteId}
              ativo
              emptyLabel="Todos os clientes ativos"
            />
          </FieldLike>
          <FieldLike label="Parceiro">
            <ParceiroSelect
              value={parceiroId}
              onChange={setParceiroId}
              ativo
              emptyLabel="Todos os parceiros ativos"
            />
          </FieldLike>
          <RelatorioPeriodoFiltro
            value={periodo}
            onChange={setPeriodo}
            hint="Filtra pela data de autuação"
          />
          <FieldLike label="Situação">
            <select
              className="select"
              value={situacao}
              onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}
              aria-label="Situação"
            >
              <option value="em_aberto">Em aberto</option>
              <option value="quitado">Quitadas / pagas</option>
              <option value="todos">Todas</option>
            </select>
          </FieldLike>
        </div>
      </section>

      <div className="despesas-toolbar">
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
        rows={rows}
        keyFn={(i) => i.id}
        emptyMessage={
          temFiltro ? "Nenhuma infração corresponde aos filtros." : "Nenhuma infração encontrada."
        }
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

function FieldLike({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
