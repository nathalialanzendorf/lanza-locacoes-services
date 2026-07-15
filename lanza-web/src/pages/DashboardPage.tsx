import { StatCard } from "@/components/StatCard";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { useResumo } from "@/api/hooks";
import { formatBrl } from "@/lib/format";
import { LanzaApiError } from "@/api/client";

export function DashboardPage() {
  const resumo = useResumo();

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
          hint={
            resumo.data
              ? `${resumo.data.clientes.total} no total`
              : undefined
          }
          tone="ok"
        />
        <StatCard
          title="Veículos ativos"
          value={resumo.data ? `${resumo.data.veiculos.ativos}` : "—"}
          hint={
            resumo.data ? `${resumo.data.veiculos.total} no total` : undefined
          }
        />
        <StatCard
          title="Contratos ativos"
          value={resumo.data ? `${resumo.data.contratos.ativos}` : "—"}
          hint={
            resumo.data
              ? `${resumo.data.contratos.total} no total`
              : undefined
          }
        />
        <StatCard
          title="Débitos cliente em aberto"
          value={
            resumo.data
              ? formatBrl(resumo.data.despesasCliente.valorEmAberto)
              : "—"
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
            resumo.data
              ? formatBrl(resumo.data.despesasParceiro.valorEmAberto)
              : "—"
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
              ? `${resumo.data.infracoes.semCondutor} sem condutor`
              : undefined
          }
          tone="warn"
        />
        <StatCard
          title="Locações abertas"
          value={resumo.data ? `${resumo.data.locacoes.abertas}` : "—"}
        />
      </div>
    </PageHeader>
  );
}
