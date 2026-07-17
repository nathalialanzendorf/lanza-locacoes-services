import { Navigate, Route, Routes } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { RecebimentosManualSection } from "@/pages/RecebimentosManualSection";
import { PagBankRecebimentosSection } from "@/pages/PagBankRecebimentosSection";

export function RecebimentosPage() {
  return (
    <PageHeader
      title="Recebimentos"
      description="Baixa manual ou lote PagBank — grava em Lanza; espelho Rastreame opcional (barra lateral)."
    >
      <PageTabs
        ariaLabel="Recebimentos"
        tabs={[
          { to: "/recebimentos", label: "Manual", end: true },
          { to: "/recebimentos/pagbank", label: "PagBank" },
        ]}
      />
      <Routes>
        <Route index element={<RecebimentosManualSection />} />
        <Route path="pagbank" element={<PagBankRecebimentosSection />} />
        <Route path="*" element={<Navigate to="/recebimentos" replace />} />
      </Routes>
    </PageHeader>
  );
}
