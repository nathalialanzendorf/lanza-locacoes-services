import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { DespesasClienteListSection } from "@/pages/despesas/DespesasClienteListSection";
import { DespesaClienteCadastroSection } from "@/pages/despesas/DespesaClienteCadastroSection";
import { DespesaClienteRenegociacaoSection } from "@/pages/despesas/DespesaClienteRenegociacaoSection";
import { DespesasParceiroListSection } from "@/pages/despesas/DespesasParceiroListSection";
import { DespesaParceiroCadastroSection } from "@/pages/despesas/DespesaParceiroCadastroSection";
import { DespesaParceiroOperacoesSection } from "@/pages/despesas/DespesaParceiroOperacoesSection";

export function DespesasPage() {
  return (
    <PageHeader
      title="Despesas"
      description="Débitos do locatário, renegociação no Rastreame e despesas de parceiro."
    >
      <PageTabs
        ariaLabel="Despesas"
        tabs={[
          { to: "/despesas/cliente", label: "Cliente" },
          { to: "/despesas/renegociacao", label: "Renegociar débitos", end: true },
          { to: "/despesas/parceiro", label: "Parceiro" },
        ]}
      />

      <Routes>
        <Route index element={<Navigate to="cliente" replace />} />
        <Route path="cliente/*" element={<DespesasClienteRoutes />} />
        <Route path="renegociacao" element={<DespesaClienteRenegociacaoSection />} />
        <Route path="parceiro/*" element={<DespesasParceiroRoutes />} />
        <Route path="cliente/renegociacao" element={<Navigate to="/despesas/renegociacao" replace />} />
      </Routes>
    </PageHeader>
  );
}

function DespesasClienteRoutes() {
  return (
    <Routes>
      <Route index element={<DespesasClienteListSection />} />
      <Route path="novo" element={<DespesaClienteCadastroSection />} />
      <Route path=":id/editar" element={<DespesaClienteCadastroRoute />} />
      <Route path="*" element={<Navigate to="/despesas/cliente" replace />} />
    </Routes>
  );
}

function DespesasParceiroRoutes() {
  return (
    <Routes>
      <Route index element={<DespesasParceiroListSection />} />
      <Route path="novo" element={<DespesaParceiroCadastroSection />} />
      <Route path="operacoes" element={<DespesaParceiroOperacoesSection />} />
      <Route path=":id/editar" element={<DespesaParceiroCadastroRoute />} />
      <Route path="*" element={<Navigate to="/despesas/parceiro" replace />} />
    </Routes>
  );
}

function DespesaClienteCadastroRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/despesas/cliente" replace />;
  return <DespesaClienteCadastroSection despesaId={id} />;
}

function DespesaParceiroCadastroRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/despesas/parceiro" replace />;
  return <DespesaParceiroCadastroSection despesaId={id} />;
}
