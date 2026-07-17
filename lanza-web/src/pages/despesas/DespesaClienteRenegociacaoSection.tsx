import { CadastroBackLink } from "@/components/CadastroBackLink";
import { RenegociacaoClientePanel } from "@/pages/RenegociacaoClientePanel";

export function DespesaClienteRenegociacaoSection() {
  return (
    <>
      <CadastroBackLink to="/despesas/cliente" label="Voltar à listagem" />
      <RenegociacaoClientePanel />
    </>
  );
}
