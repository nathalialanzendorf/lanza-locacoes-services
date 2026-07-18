import { useSearchParams } from "react-router-dom";

import { ContratosCadastroSection } from "@/pages/contratos/ContratosCadastroSection";

export function ContratosCadastrarSection() {
  return (
    <ContratosCadastroSection modo="criar" titulo="Cadastrar contrato" submitLabel="Gerar contrato" />
  );
}

export function ContratosRenovarSection() {
  const [searchParams] = useSearchParams();
  const contratoId = searchParams.get("id")?.trim() || undefined;

  return (
    <ContratosCadastroSection
      modo="renovar"
      contratoId={contratoId}
      titulo="Renovar contrato"
      submitLabel="Gerar renovação"
    />
  );
}
