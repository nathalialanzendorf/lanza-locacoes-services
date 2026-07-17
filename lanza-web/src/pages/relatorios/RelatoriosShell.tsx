import { Navigate, Outlet } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";

export function RelatoriosShell() {
  return (
    <PageHeader
      title="Relatórios"
      description="Cobranças, prestação de contas e encerramento de contrato."
    >
      <PageTabs
        ariaLabel="Relatórios"
        tabs={[
          { to: "/relatorios/cobrancas", label: "Cobranças", end: true },
          { to: "/relatorios/prestacao-contas", label: "Prestação de contas" },
          { to: "/relatorios/encerramento", label: "Encerramento" },
        ]}
      />
      <Outlet />
    </PageHeader>
  );
}

export function RelatoriosIndexRedirect() {
  return <Navigate to="cobrancas" replace />;
}
