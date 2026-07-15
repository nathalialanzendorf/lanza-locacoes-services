import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ClientesPage } from "@/pages/ClientesPage";
import { ContratosPage } from "@/pages/ContratosPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DespesasPage } from "@/pages/DespesasPage";
import { LocacoesPage } from "@/pages/LocacoesPage";
import { VeiculosPage } from "@/pages/VeiculosPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="clientes" element={<ClientesPage />} />
            <Route path="veiculos" element={<VeiculosPage />} />
            <Route path="contratos" element={<ContratosPage />} />
            <Route path="despesas" element={<DespesasPage />} />
            <Route path="locacoes" element={<LocacoesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
