import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "@/components/Layout";

import { GuestRoute, ProtectedRoute } from "@/components/ProtectedRoute";

import { AuthProvider } from "@/context/AuthContext";

import { ClientesPage } from "@/pages/ClientesPage";

import { ContratosPage } from "@/pages/ContratosPage";

import { DashboardPage } from "@/pages/DashboardPage";

import { DespesasPage } from "@/pages/DespesasPage";

import { RelatorioFipeSection } from "@/pages/relatorios/RelatorioFipeSection";
import { RelatorioInfracoesSection } from "@/pages/relatorios/RelatorioInfracoesSection";

import { LoginPage } from "@/pages/LoginPage";

import { MovimentacaoPage } from "@/pages/MovimentacaoPage";

import { ParceirosPage } from "@/pages/ParceirosPage";

import { RecebimentosPage } from "@/pages/RecebimentosPage";

import { RegisterPage } from "@/pages/RegisterPage";

import { RelatorioCobrancasForm } from "@/pages/relatorios/RelatorioCobrancasForm";

import { RelatorioEncerramentoForm } from "@/pages/relatorios/RelatorioEncerramentoForm";

import { RelatorioPrestacaoContasForm } from "@/pages/relatorios/RelatorioPrestacaoContasForm";

import {

  RelatoriosIndexRedirect,

  RelatoriosShell,

} from "@/pages/relatorios/RelatoriosShell";

import { VeiculosPage } from "@/pages/VeiculosPage";
import { SyncPage } from "@/pages/SyncPage";



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

      <AuthProvider>

        <BrowserRouter>

          <Routes>

            <Route element={<GuestRoute />}>

              <Route path="/login" element={<LoginPage />} />

              <Route path="/registro" element={<RegisterPage />} />

            </Route>



            <Route element={<ProtectedRoute />}>

              <Route element={<Layout />}>

                <Route index element={<DashboardPage />} />

                <Route path="clientes/*" element={<ClientesPage />} />

                <Route path="veiculos/*" element={<VeiculosPage />} />

                <Route path="parceiros/*" element={<ParceirosPage />} />

                <Route path="contratos/*" element={<ContratosPage />} />

                <Route path="despesas/*" element={<DespesasPage />} />

                <Route path="infracoes" element={<Navigate to="/relatorios/infracoes" replace />} />

                <Route path="movimentacao/*" element={<MovimentacaoPage />} />

                <Route path="recebimentos/*" element={<RecebimentosPage />} />

                <Route path="sync" element={<SyncPage />} />

                <Route path="relatorios" element={<RelatoriosShell />}>

                  <Route index element={<RelatoriosIndexRedirect />} />

                  <Route path="cobrancas" element={<RelatorioCobrancasForm />} />

                  <Route path="prestacao-contas" element={<RelatorioPrestacaoContasForm />} />

                  <Route path="encerramento" element={<RelatorioEncerramentoForm />} />

                  <Route path="infracoes" element={<RelatorioInfracoesSection />} />

                  <Route path="fipe" element={<RelatorioFipeSection />} />

                </Route>

                <Route path="locacoes" element={<Navigate to="/movimentacao" replace />} />

              </Route>

            </Route>



            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>

        </BrowserRouter>

      </AuthProvider>

    </QueryClientProvider>

  );

}

