import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { ContratosListSection } from "@/pages/contratos/ContratosListSection";
import { ContratosCadastroSection } from "@/pages/contratos/ContratosCadastroSection";
import { ContratosEncerrarSection } from "@/pages/ContratosEncerrarSection";

export function ContratosPage() {
  return (
    <PageHeader
      title="Contratos"
      description="Listagem e geração de contratos de locação (Word/PDF + contratos.json)."
    >
      <Routes>
        <Route index element={<ContratosListSection />} />
        <Route path="novo" element={<ContratosCadastroSection />} />
        <Route path=":id/editar" element={<ContratosCadastroRoute />} />
        <Route path="encerrar" element={<ContratosEncerrarSection />} />
        <Route path="cadastro" element={<Navigate to="/contratos/novo" replace />} />
        <Route path="*" element={<Navigate to="/contratos" replace />} />
      </Routes>
    </PageHeader>
  );
}

function ContratosCadastroRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/contratos" replace />;
  return <ContratosCadastroSection contratoId={id} />;
}
