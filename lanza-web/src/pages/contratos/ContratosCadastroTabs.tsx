import { ContratosCadastroSection } from "@/pages/contratos/ContratosCadastroSection";

export function ContratosCadastrarSection() {
  return (
    <ContratosCadastroSection modo="criar" titulo="Cadastrar contrato" submitLabel="Gerar contrato" />
  );
}

export function ContratosRenovarSection() {
  return (
    <ContratosCadastroSection modo="renovar" titulo="Renovar contrato" submitLabel="Gerar renovação" />
  );
}
