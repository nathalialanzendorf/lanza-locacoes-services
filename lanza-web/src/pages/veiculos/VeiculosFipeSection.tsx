import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataFieldsPanel } from "@/components/DataFieldsPanel";
import { VeiculoSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { LABEL } from "@/lib/labels";

type FipeResposta = {
  data?: Record<string, unknown>;
  fipe?: Record<string, unknown>;
};

function linhasFipe(resposta: FipeResposta) {
  const veiculo = resposta.data ?? {};
  const fipe = resposta.fipe ?? {};

  return [
    { label: "Placa", value: veiculo.placa },
    { label: "Marca / modelo", value: veiculo.marcaModelo },
    { label: "Ano / modelo", value: veiculo.anoModelo },
    { label: "Modelo FIPE", value: fipe.fipeModelo ?? veiculo.fipeModelo },
    { label: "Código FIPE", value: fipe.fipeCodigo ?? veiculo.fipeCodigo },
    { label: "Valor FIPE", value: fipe.fipeValor ?? veiculo.fipeValor },
    { label: "Mês referência", value: fipe.fipeReferencia ?? veiculo.fipeReferencia },
    { label: "URL FIPE", value: fipe.fipe ?? veiculo.fipe },
  ];
}

export function VeiculosFipeSection() {
  const qc = useQueryClient();
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<FipeResposta | null>(null);

  async function consultar() {
    if (!placa.trim()) {
      setError("Selecione o veículo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = (await lanzaApi.atualizarFipeVeiculo(placa.trim())) as FipeResposta;
      setResultado(r);
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
    } catch (err) {
      setResultado(null);
      setError(err instanceof LanzaApiError ? err.message : "Falha ao consultar FIPE.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FormCard
        title="Consulta FIPE"
        onSubmit={consultar}
        loading={loading}
        submitLabel={LABEL.consultar}
        error={error}
      >
        <Field label="Veículo" hint="Veículo já cadastrado no Lanza">
          <VeiculoSelect value={placa} onChange={setPlaca} required disabled={loading} />
        </Field>
      </FormCard>

      {resultado ? <DataFieldsPanel title="Dados FIPE" rows={linhasFipe(resultado)} /> : null}
    </>
  );
}
