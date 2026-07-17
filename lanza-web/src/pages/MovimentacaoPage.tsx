import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { MovimentacaoListSection } from "@/pages/movimentacao/MovimentacaoListSection";
import { MovimentacaoCadastroSection } from "@/pages/movimentacao/MovimentacaoCadastroSection";

export function MovimentacaoPage() {
  return (
    <PageHeader
      title="Movimentação"
      description="Locado, reserva, manutenção e trocas — registos em locacoes.json."
    >
      <Routes>
        <Route index element={<MovimentacaoListSection />} />
        <Route path="novo" element={<MovimentacaoCadastroSection />} />
        <Route path=":id/editar" element={<MovimentacaoCadastroRoute />} />
        <Route path="cadastro" element={<Navigate to="/movimentacao/novo" replace />} />
        <Route path="*" element={<Navigate to="/movimentacao" replace />} />
      </Routes>
    </PageHeader>
  );
}

function MovimentacaoCadastroRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/movimentacao" replace />;
  return <MovimentacaoCadastroSection locacaoId={id} />;
}
