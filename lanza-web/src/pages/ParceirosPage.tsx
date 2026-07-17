import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { ParceirosListSection } from "@/pages/parceiros/ParceirosListSection";
import { ParceirosCadastroSection } from "@/pages/parceiros/ParceirosCadastroSection";

export function ParceirosPage() {
  return (
    <PageHeader
      title="Parceiros"
      description="Proprietários dos veículos — listagem e cadastro com upload de CRLV."
    >
      <Routes>
        <Route index element={<ParceirosListSection />} />
        <Route path="novo" element={<ParceirosCadastroSection />} />
        <Route path=":id/editar" element={<ParceirosCadastroRoute />} />
        <Route path="cadastro" element={<Navigate to="/parceiros/novo" replace />} />
        <Route path="*" element={<Navigate to="/parceiros" replace />} />
      </Routes>
    </PageHeader>
  );
}

function ParceirosCadastroRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/parceiros" replace />;
  return <ParceirosCadastroSection parceiroId={id} />;
}
