import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataFieldsPanel } from "@/components/DataFieldsPanel";
import { Field, FormCard } from "@/components/FormCard";
import { useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { LABEL } from "@/lib/labels";

type FipeResposta = {
  cadastrado?: boolean;
  data?: Record<string, unknown>;
  fipe?: Record<string, unknown>;
};

function normPlaca(placa?: string | null): string {
  return (placa ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

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

type Props = {
  title?: string;
  /** Exibe opção de gravar FIPE no cadastro quando a placa já existe na frota. */
  showPersistOption?: boolean;
};

export function FipeConsultaForm({ title = "Consulta FIPE", showPersistOption = true }: Props) {
  const qc = useQueryClient();
  const veiculosQuery = useVeiculos();
  const [placa, setPlaca] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [anoModelo, setAnoModelo] = useState("");
  const [persist, setPersist] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<FipeResposta | null>(null);

  const placaNorm = normPlaca(placa);
  const cadastrado = useMemo(() => {
    if (!placaNorm) return false;
    return (veiculosQuery.data?.items ?? []).some((v) => normPlaca(v.placa) === placaNorm);
  }, [veiculosQuery.data, placaNorm]);

  async function consultar() {
    if (!placa.trim()) {
      setError("Informe a placa.");
      return;
    }
    if (!cadastrado && (!marcaModelo.trim() || !anoModelo.trim())) {
      setError("Veículo não cadastrado — informe marca/modelo e ano.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const r = (await lanzaApi.consultarFipe({
        placa: placa.trim(),
        marcaModelo: marcaModelo.trim() || undefined,
        anoModelo: anoModelo.trim() || undefined,
        persist: showPersistOption && cadastrado ? persist : undefined,
      })) as FipeResposta;
      setResultado(r);
      if (r.cadastrado && persist) {
        void qc.invalidateQueries({ queryKey: ["veiculos"] });
      }
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
        title={title}
        onSubmit={consultar}
        loading={loading}
        submitLabel={LABEL.consultar}
        error={error}
      >
        <Field label="Placa" hint="Digite a placa — cadastrada ou não">
          <input
            className="input"
            value={placa}
            onChange={(e) => setPlaca(e.target.value.toUpperCase())}
            placeholder="ABC1D23"
            required
            disabled={loading}
          />
        </Field>
        {!cadastrado && placaNorm ? (
          <>
            <Field label="Marca / modelo" hint="Ex.: VW/GOL">
              <input
                className="input"
                value={marcaModelo}
                onChange={(e) => setMarcaModelo(e.target.value)}
                placeholder="MARCA/MODELO"
                required
                disabled={loading}
              />
            </Field>
            <Field label="Ano / modelo" hint="Ex.: 2018/2018">
              <input
                className="input"
                value={anoModelo}
                onChange={(e) => setAnoModelo(e.target.value)}
                placeholder="2018/2018"
                required
                disabled={loading}
              />
            </Field>
          </>
        ) : null}
        {showPersistOption && cadastrado ? (
          <Field label="Gravar">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
                disabled={loading}
              />
              Atualizar cadastro com valor FIPE
            </label>
          </Field>
        ) : null}
      </FormCard>

      {resultado ? (
        <>
          {resultado.cadastrado === false ? (
            <p className="field__hint">Consulta avulsa — veículo não cadastrado no Lanza.</p>
          ) : null}
          <DataFieldsPanel title="Dados FIPE" rows={linhasFipe(resultado)} />
        </>
      ) : null}
    </>
  );
}
