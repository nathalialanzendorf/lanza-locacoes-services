import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { VeiculosListSection } from "@/pages/veiculos/VeiculosListSection";
import { VeiculosCadastroSection } from "@/pages/veiculos/VeiculosCadastroSection";
import { VeiculosToolsSection } from "@/pages/VeiculosToolsSection";

export function VeiculosPage() {
  return (
    <PageHeader
      title="Veículos"
      description="Frota de locação — listagem, cadastro e ferramentas FIPE/CRLV."
    >
      <PageTabs
        ariaLabel="Veículos"
        tabs={[
          { to: "/veiculos", label: "Listagem", end: true },
          { to: "/veiculos/fipe", label: "FIPE / CRLV" },
        ]}
      />
      <Routes>
        <Route index element={<VeiculosListSection />} />
        <Route path="novo" element={<VeiculosCadastroSection />} />
        <Route path=":id/editar" element={<VeiculosCadastroRoute />} />
        <Route path="fipe" element={<VeiculosToolsSection />} />
        <Route path="cadastro" element={<Navigate to="/veiculos/novo" replace />} />
        <Route path="*" element={<Navigate to="/veiculos" replace />} />
      </Routes>
    </PageHeader>
  );
}

function VeiculosCadastroRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/veiculos" replace />;
  return <VeiculosCadastroSection veiculoId={id} />;
}
