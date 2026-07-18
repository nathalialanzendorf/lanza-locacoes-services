import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { LABEL } from "@/lib/labels";
import { ContratosListSection } from "@/pages/contratos/ContratosListSection";
import { ContratosCadastrarSection, ContratosRenovarSection } from "@/pages/contratos/ContratosCadastroTabs";
import { ContratosCadastroSection } from "@/pages/contratos/ContratosCadastroSection";
import { ContratosEncerrarSection } from "@/pages/contratos/ContratosEncerrarSection";

export function ContratosPage() {
  return (
    <PageHeader
      title="Contratos"
      description="Listagem e geração de contratos de locação (Word/PDF + contratos.json)."
    >
      <PageTabs
        ariaLabel="Contratos"
        tabs={[
          { to: "/contratos", label: LABEL.listar, end: true },
          { to: "/contratos/cadastrar", label: "Cadastrar" },
          { to: "/contratos/renovar", label: "Renovar" },
          { to: "/contratos/encerrar", label: "Encerramento" },
        ]}
      />
      <Routes>
        <Route index element={<ContratosListSection />} />
        <Route path="cadastrar" element={<ContratosCadastrarSection />} />
        <Route path="renovar" element={<ContratosRenovarSection />} />
        <Route path="encerrar" element={<ContratosEncerrarSection />} />
        <Route path=":id/editar" element={<ContratosCadastroRoute />} />
        <Route path="novo" element={<Navigate to="/contratos/cadastrar" replace />} />
        <Route path="cadastro" element={<Navigate to="/contratos/cadastrar" replace />} />
        <Route path="*" element={<Navigate to="/contratos" replace />} />
      </Routes>
    </PageHeader>
  );
}

function ContratosCadastroRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/contratos" replace />;
  return (
    <ContratosCadastroSection
      modo="renovar"
      contratoId={id}
      titulo="Renovar contrato"
      submitLabel="Gerar renovação"
    />
  );
}
