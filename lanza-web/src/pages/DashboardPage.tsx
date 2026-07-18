import { useMemo } from "react";
import { Link } from "react-router-dom";

import { StatCard } from "@/components/StatCard";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { IconRecebimento } from "@/components/icons";
import { useResumo, useClientes, useContratos } from "@/api/hooks";
import { formatBrl, formatPlaca, clienteExibicaoPorId } from "@/lib/format";
import { semClienteDeResumo } from "@/lib/clienteCampo";
import { LABEL } from "@/lib/labels";
import { urlLancarRecebimento } from "@/lib/recebimentoUrl";
import {
  PROXIMO_VENCER_DIAS,
  alertaVencimentoContrato,
  dataFimPrevistaContrato,
  hojeIsoBr,
  ordenarContratosRenovacao,
  rotuloAlertaVencimento,
  rowClassVencimentoContrato,
} from "@/lib/contratoVencimento";
import { LanzaApiError } from "@/api/client";
import type { Contrato, DashboardRecebimentoLinha, DashboardRecebimentos } from "@/api/types";

const RECEBIMENTOS_VAZIO: DashboardRecebimentos = {
  dataReferenciaBr: "—",
  tituloPagamentoSemanal: "Pagamento semanal",
  venceHoje: [],
  atrasados: [],
  totais: { venceHoje: 0, atrasado: 0, semanal: 0, caucao: 0, renegociacao: 0 },
};

function RecebimentosTable({
  titulo,
  linhas,
  colunaExtra,
  colunaVeiculo = "Placa",
  clientes,
  mostrarAcaoRecebimento = false,
  dataReferenciaBr,
}: {
  titulo: string;
  linhas: DashboardRecebimentoLinha[];
  colunaExtra?: { header: string; render: (l: DashboardRecebimentoLinha) => string };
  colunaVeiculo?: "Placa" | "Veículo";
  clientes?: { id: string; nome?: string; ativo?: boolean }[];
  mostrarAcaoRecebimento?: boolean;
  dataReferenciaBr?: string;
}) {
  return (
    <section className="form-card dashboard-recebimentos">
      <header className="dashboard-recebimentos__head">
        <h2 className="form-card__title">{titulo}</h2>
        <span className="field__hint">{linhas.length} locatário(s)</span>
      </header>
      {linhas.length === 0 ? (
        <p className="field__hint">Nenhum registo para hoje.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>{colunaVeiculo}</th>
                {colunaExtra ? <th>{colunaExtra.header}</th> : null}
                <th className="num">Valor</th>
                {mostrarAcaoRecebimento ? <th className="col-acoes">Ação</th> : null}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const recebimentoTo = mostrarAcaoRecebimento
                  ? urlLancarRecebimento(l, dataReferenciaBr)
                  : null;
                return (
                <tr key={`${l.clienteId ?? "—"}-${l.placa}`}>
                  <td>{clienteExibicaoPorId(clientes, l.clienteId, l.clienteNome)}</td>
                  <td>{colunaVeiculo === "Veículo" ? (l.veiculo ?? l.placa) : l.placa}</td>
                  {colunaExtra ? <td>{colunaExtra.render(l)}</td> : null}
                  <td className="num">{formatBrl(l.valor)}</td>
                  {mostrarAcaoRecebimento ? (
                    <td className="col-acoes">
                      {recebimentoTo ? (
                        <Link
                          to={recebimentoTo}
                          className="btn btn--icon btn--icon-ok"
                          aria-label={LABEL.lancarRecebimento}
                          title={LABEL.lancarRecebimento}
                        >
                          <IconRecebimento className="row-actions__icon" />
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ContratosVencimentoTable({
  titulo,
  linhas,
  hojeIso,
  clientes,
  vazio,
}: {
  titulo: string;
  linhas: Contrato[];
  hojeIso: string;
  clientes?: { id: string; nome?: string; ativo?: boolean }[];
  vazio: string;
}) {
  return (
    <section className="form-card dashboard-recebimentos">
      <header className="dashboard-recebimentos__head">
        <h3 className="form-card__title">{titulo}</h3>
        <span className="field__hint">{linhas.length} contrato{linhas.length === 1 ? "" : "s"}</span>
      </header>
      {linhas.length === 0 ? (
        <p className="field__hint">{vazio}</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Placa</th>
                <th>Fim previsto</th>
                <th>Alerta</th>
                <th className="col-acoes">Ação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => {
                const fim = dataFimPrevistaContrato(c);
                const alerta = alertaVencimentoContrato(fim, hojeIso);
                const rotulo = rotuloAlertaVencimento(fim, hojeIso);
                return (
                  <tr key={c.id} className={rowClassVencimentoContrato(c, hojeIso)}>
                    <td>
                      {clienteExibicaoPorId(clientes, c.clienteId, c.clienteNome)}
                    </td>
                    <td>{formatPlaca(c.placa ?? c.veiculo?.placa)}</td>
                    <td>{fim ?? "—"}</td>
                    <td>
                      {rotulo ? (
                        <span
                          className={
                            alerta === "vencido" ? "badge badge--danger" : "badge badge--warn"
                          }
                        >
                          {rotulo}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="col-acoes">
                      <Link
                        to={`/contratos/renovar?id=${encodeURIComponent(c.id)}`}
                        className="btn btn--ghost btn--sm"
                      >
                        Renovar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function DashboardPage() {
  const resumo = useResumo();
  const clientesQuery = useClientes();
  const contratosQuery = useContratos({ status: "ativo" });
  const rec = resumo.data?.recebimentos ?? RECEBIMENTOS_VAZIO;
  const clientes = clientesQuery.data?.items;
  const hojeIso = hojeIsoBr();

  const contratosVencimento = useMemo(() => {
    const vencidos: Contrato[] = [];
    const aVencer: Contrato[] = [];
    for (const c of contratosQuery.data?.items ?? []) {
      const alerta = alertaVencimentoContrato(dataFimPrevistaContrato(c), hojeIso);
      if (alerta === "vencido") vencidos.push(c);
      else if (alerta === "proximo") aVencer.push(c);
    }
    vencidos.sort((a, b) => ordenarContratosRenovacao(a, b, hojeIso));
    aVencer.sort((a, b) => ordenarContratosRenovacao(a, b, hojeIso));
    return { vencidos, aVencer };
  }, [contratosQuery.data, hojeIso]);

  return (
    <PageHeader
      title="Dashboard"
      description="Visão geral da frota, contratos e pendências financeiras."
    >
      {resumo.isError ? (
        <QueryError
          message={
            resumo.error instanceof LanzaApiError
              ? resumo.error.message
              : "Falha na ligação à API."
          }
        />
      ) : null}

      <div className="stat-grid">
        <StatCard
          title="Clientes ativos"
          value={resumo.data ? `${resumo.data.clientes.ativos}` : "—"}
          hint={resumo.data ? `${resumo.data.clientes.total} no total` : undefined}
          tone="ok"
        />
        <StatCard
          title="Veículos ativos"
          value={resumo.data ? `${resumo.data.veiculos.ativos}` : "—"}
          hint={resumo.data ? `${resumo.data.veiculos.total} no total` : undefined}
        />
        <StatCard
          title="Contratos ativos"
          value={resumo.data ? `${resumo.data.contratos.ativos}` : "—"}
          hint={resumo.data ? `${resumo.data.contratos.total} no total` : undefined}
        />
      </div>

      <div className="stat-grid stat-grid--pendencias">
        <StatCard
          title="Débitos cliente em aberto"
          value={
            resumo.data ? formatBrl(resumo.data.despesasCliente.valorEmAberto) : "—"
          }
          hint={
            resumo.data
              ? `${resumo.data.despesasCliente.emAberto} lançamentos`
              : undefined
          }
          tone="warn"
        />
        <StatCard
          title="Despesas parceiro em aberto"
          value={
            resumo.data ? formatBrl(resumo.data.despesasParceiro.valorEmAberto) : "—"
          }
          hint={
            resumo.data
              ? `${resumo.data.despesasParceiro.emAberto} lançamentos`
              : undefined
          }
        />
        <StatCard
          title="Infrações em aberto com data de vencimento"
          value={resumo.data ? `${resumo.data.infracoes.comVencimento}` : "—"}
          hint={
            resumo.data
              ? `${resumo.data.infracoes.emAberto} em aberto no total`
              : undefined
          }
          tone="warn"
        />
        <StatCard
          title="Infrações em aberto sem cliente"
          value={resumo.data ? `${semClienteDeResumo(resumo.data.infracoes)}` : "—"}
          tone="warn"
        />
      </div>

      {contratosQuery.isLoading ? (
        <p className="field__hint">A carregar contratos…</p>
      ) : contratosQuery.isError ? (
        <QueryError
          message={
            contratosQuery.error instanceof LanzaApiError
              ? contratosQuery.error.message
              : "Falha ao listar contratos."
          }
        />
      ) : (
        <section className="dashboard-recebimentos-resumo">
          <h2 className="form-card__title">Contratos</h2>
          <div className="stat-grid stat-grid--compact">
            <StatCard
              title="Vencidos"
              value={`${contratosVencimento.vencidos.length}`}
              tone="warn"
            />
            <StatCard
              title={`A vencer (${PROXIMO_VENCER_DIAS} dias)`}
              value={`${contratosVencimento.aVencer.length}`}
              tone="warn"
            />
          </div>
          <ContratosVencimentoTable
            titulo="Vencidos"
            linhas={contratosVencimento.vencidos}
            hojeIso={hojeIso}
            clientes={clientes}
            vazio="Nenhum contrato ativo vencido."
          />
          <ContratosVencimentoTable
            titulo={`A vencer (próximos ${PROXIMO_VENCER_DIAS} dias)`}
            linhas={contratosVencimento.aVencer}
            hojeIso={hojeIso}
            clientes={clientes}
            vazio="Nenhum contrato a vencer nos próximos 14 dias."
          />
        </section>
      )}

      {resumo.isLoading ? (
        <p className="field__hint">A carregar recebimentos…</p>
      ) : (
        <>
          <section className="dashboard-recebimentos-resumo">
            <h2 className="form-card__title">Recebimentos — {rec.dataReferenciaBr}</h2>
            <div className="stat-grid stat-grid--compact">
              <StatCard
                title="Total vence hoje"
                value={formatBrl(rec.totais.venceHoje)}
                hint={`${rec.venceHoje.length} locatário(s)`}
                tone="ok"
              />
              <StatCard
                title="Total em atraso"
                value={formatBrl(rec.totais.atrasado)}
                hint={`${rec.atrasados.length} locatário(s)`}
                tone="warn"
              />
              <StatCard
                title="Semanal em aberto"
                value={formatBrl(rec.totais.semanal)}
                hint="Parcelas semanais (nominal)"
              />
              <StatCard
                title="Caução em aberto"
                value={formatBrl(rec.totais.caucao)}
              />
              <StatCard
                title="Renegociação em aberto"
                value={formatBrl(rec.totais.renegociacao)}
              />
            </div>
          </section>

          <RecebimentosTable
            titulo={rec.tituloPagamentoSemanal ?? "Pagamento semanal"}
            linhas={rec.venceHoje}
            colunaVeiculo="Veículo"
            clientes={clientes}
            mostrarAcaoRecebimento
            dataReferenciaBr={rec.dataReferenciaBr}
          />

          <RecebimentosTable
            titulo="Em atraso"
            linhas={rec.atrasados}
            colunaVeiculo="Veículo"
            clientes={clientes}
            colunaExtra={{
              header: "Atraso / vencimentos",
              render: (l) => {
                const dias =
                  l.diasAtraso != null && l.diasAtraso > 0
                    ? `${l.diasAtraso} dia(s) · `
                    : "";
                const venc =
                  l.vencimentosBr?.length
                    ? l.vencimentosBr.join(", ")
                    : (l.vencimentoBr ?? "—");
                return `${dias}${venc}`;
              },
            }}
          />
        </>
      )}
    </PageHeader>
  );
}
