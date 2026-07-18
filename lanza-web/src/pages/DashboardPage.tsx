import { StatCard } from "@/components/StatCard";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { useResumo, useClientes } from "@/api/hooks";
import { formatBrl, clienteExibicaoPorId } from "@/lib/format";
import { semClienteDeResumo } from "@/lib/clienteCampo";
import { LanzaApiError } from "@/api/client";
import type { DashboardRecebimentoLinha, DashboardRecebimentos } from "@/api/types";

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
}: {
  titulo: string;
  linhas: DashboardRecebimentoLinha[];
  colunaExtra?: { header: string; render: (l: DashboardRecebimentoLinha) => string };
  colunaVeiculo?: "Placa" | "Veículo";
  clientes?: { id: string; nome?: string; ativo?: boolean }[];
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
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.clienteId ?? "—"}-${l.placa}`}>
                  <td>{clienteExibicaoPorId(clientes, l.clienteId, l.clienteNome)}</td>
                  <td>{colunaVeiculo === "Veículo" ? (l.veiculo ?? l.placa) : l.placa}</td>
                  {colunaExtra ? <td>{colunaExtra.render(l)}</td> : null}
                  <td className="num">{formatBrl(l.valor)}</td>
                </tr>
              ))}
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
  const rec = resumo.data?.recebimentos ?? RECEBIMENTOS_VAZIO;
  const clientes = clientesQuery.data?.items;

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
          title="Infrações em aberto"
          value={resumo.data ? `${resumo.data.infracoes.emAberto}` : "—"}
          hint={
            resumo.data
              ? `${semClienteDeResumo(resumo.data.infracoes)} sem cliente`
              : undefined
          }
          tone="warn"
        />
        <StatCard
          title="Locações abertas"
          value={resumo.data ? `${resumo.data.locacoes.abertas}` : "—"}
        />
      </div>

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
