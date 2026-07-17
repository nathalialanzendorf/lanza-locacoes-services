import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { VeiculosListSection } from "@/pages/veiculos/VeiculosListSection";
import { VeiculosCadastroSection } from "@/pages/veiculos/VeiculosCadastroSection";
import { VeiculosFipeSection } from "@/pages/veiculos/VeiculosFipeSection";
import { VeiculosImportarSection } from "@/pages/veiculos/VeiculosImportarSection";
import { LABEL } from "@/lib/labels";

export function VeiculosPage() {
  return (
    <PageHeader
      title="Veículos"
      description="Frota de locação — listagem, cadastro, consulta FIPE e importação de CRLV."
    >
      <PageTabs
        ariaLabel="Veículos"
        tabs={[
          { to: "/veiculos", label: LABEL.listar, end: true },
          { to: "/veiculos/fipe", label: "FIPE" },
        ]}
      />
      <Routes>
        <Route index element={<VeiculosListSection />} />
        <Route path="novo" element={<VeiculosCadastroSection />} />
        <Route path="importar" element={<VeiculosImportarSection />} />
        <Route path=":id/editar" element={<VeiculosCadastroRoute />} />
        <Route path="fipe" element={<VeiculosFipeSection />} />
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
