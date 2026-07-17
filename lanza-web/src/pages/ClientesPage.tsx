import { Navigate, Route, Routes } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { ClientesListSection } from "@/pages/clientes/ClientesListSection";
import { ClientesCadastroSection } from "@/pages/clientes/ClientesCadastroSection";
import { AnaliseCadastroSection } from "@/pages/clientes/AnaliseCadastroSection";

export function ClientesPage() {
  return (
    <PageHeader
      title="Clientes"
      description="Motoristas e locatários — cadastro manual com upload de CNH/comprovante ou importação em lote."
    >
      <PageTabs
        ariaLabel="Clientes"
        tabs={[
          { to: "/clientes", label: "Listagem", end: true },
          { to: "/clientes/cadastro", label: "Cadastro" },
          { to: "/clientes/analise", label: "Análise cadastro" },
        ]}
      />
      <Routes>
        <Route index element={<ClientesListSection />} />
        <Route path="cadastro" element={<ClientesCadastroSection />} />
        <Route path="analise" element={<AnaliseCadastroSection />} />
        <Route path="*" element={<Navigate to="/clientes" replace />} />
      </Routes>
    </PageHeader>
  );
}
