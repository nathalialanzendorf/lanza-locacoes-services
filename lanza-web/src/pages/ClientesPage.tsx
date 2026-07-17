import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { ClientesListSection } from "@/pages/clientes/ClientesListSection";
import { ClientesCadastroSection } from "@/pages/clientes/ClientesCadastroSection";
import { ClientesImportarSection } from "@/pages/clientes/ClientesImportarSection";
import { ClientesImportLoteSection } from "@/pages/clientes/ClientesImportLoteSection";
import { AnaliseCadastroSection } from "@/pages/clientes/AnaliseCadastroSection";

import { LABEL } from "@/lib/labels";

export function ClientesPage() {
  return (
    <PageHeader
      title="Clientes"
      description="Motoristas e locatários — listagem, cadastro com upload de documentos ou importação em lote."
    >
      <PageTabs
        ariaLabel="Clientes"
        tabs={[
          { to: "/clientes", label: LABEL.listar, end: true },
          { to: "/clientes/analise", label: "Análise cadastro" },
        ]}
      />
      <Routes>
        <Route index element={<ClientesListSection />} />
        <Route path="novo" element={<ClientesCadastroSection />} />
        <Route path=":id/editar" element={<ClientesCadastroRoute />} />
        <Route path="importar" element={<ClientesImportarSection />} />
        <Route path="importar-lote" element={<ClientesImportLoteSection />} />
        <Route path="analise" element={<AnaliseCadastroSection />} />
        <Route path="cadastro" element={<Navigate to="/clientes/novo" replace />} />
        <Route path="*" element={<Navigate to="/clientes" replace />} />
      </Routes>
    </PageHeader>
  );
}

function ClientesCadastroRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/clientes" replace />;
  return <ClientesCadastroSection clienteId={id} />;
}
