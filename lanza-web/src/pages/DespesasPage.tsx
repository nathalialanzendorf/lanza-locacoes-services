import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { DespesasClienteSection } from "@/pages/DespesasClienteSection";
import { DespesasParceiroSection } from "@/pages/DespesasParceiroSection";

export function DespesasPage() {
  return (
    <PageHeader
      title="Despesas"
      description="Débitos cobráveis do locatário e despesas de parceiro (IPVA, seguro, rastreador, etc.)."
    >
      <nav className="tabs" aria-label="Tipo de despesa">
        <NavLink
          to="/despesas/cliente"
          className={({ isActive }) =>
            isActive ? "tabs__link tabs__link--active" : "tabs__link"
          }
        >
          Cliente
        </NavLink>
        <NavLink
          to="/despesas/parceiro"
          className={({ isActive }) =>
            isActive ? "tabs__link tabs__link--active" : "tabs__link"
          }
        >
          Parceiro
        </NavLink>
      </nav>

      <Routes>
        <Route index element={<Navigate to="cliente" replace />} />
        <Route path="cliente" element={<DespesasClienteSection />} />
        <Route path="parceiro" element={<DespesasParceiroSection />} />
      </Routes>
    </PageHeader>
  );
}
