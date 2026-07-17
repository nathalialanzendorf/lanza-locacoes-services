import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { DocUploadField } from "@/components/DocUploadField";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

type Props = {
  parceiroId?: string;
};

export function ParceirosCadastroSection({ parceiroId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editando = Boolean(parceiroId);

  const [nome, setNome] = useState("");
  const [placa, setPlaca] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [cadastrarVeiculo, setCadastrarVeiculo] = useState(true);
  const [carregando, setCarregando] = useState(editando);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  function aplicarCrlv(campos: Record<string, unknown>) {
    if (typeof campos.proprietarioNome === "string" && campos.proprietarioNome.trim()) {
      setNome(campos.proprietarioNome.trim());
    }
    if (typeof campos.placa === "string") setPlaca(campos.placa);
    if (typeof campos.marcaModelo === "string") setMarcaModelo(campos.marcaModelo);
  }

  useEffect(() => {
    if (!parceiroId) return;
    let cancelado = false;
    setCarregando(true);
    setError(null);
    void lanzaApi
      .obterParceiro(parceiroId)
      .then((r) => {
        if (cancelado) return;
        setNome(r.data.nome);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err instanceof LanzaApiError ? err.message : "Falha ao carregar parceiro.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [parceiroId]);

  async function submit() {
    if (!nome.trim()) {
      setError("Informe o nome do parceiro.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (editando) {
        const parceiro = await lanzaApi.atualizarParceiro(parceiroId!, nome.trim());
        setResult({ parceiro });
      } else {
        const parceiro = await lanzaApi.criarParceiro(nome.trim());
        let veiculoResult: unknown = null;

        if (cadastrarVeiculo && placa.trim()) {
          veiculoResult = await lanzaApi.criarVeiculo({
            placa: placa.trim(),
            marcaModelo: marcaModelo.trim() || undefined,
            parceiroNome: nome.trim(),
            ativo: true,
            origem: "web-upload-crlv-parceiro",
          });
        }

        setResult({ parceiro, veiculo: veiculoResult });
      }

      void qc.invalidateQueries({ queryKey: ["parceiros"] });
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
      void qc.invalidateQueries({ queryKey: ["parceiros-vinculos"] });
      navigate("/parceiros");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar parceiro.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to="/parceiros" />
        <p className="muted">A carregar parceiro…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to="/parceiros" />
      <FormCard
        title={editando ? "Editar parceiro" : "Novo parceiro"}
        onSubmit={submit}
        loading={loading}
        submitLabel={editando ? "Salvar alterações" : "Gravar parceiro"}
        error={error}
      >
        <DocUploadField
          label="CRLV (PDF)"
          tipo="crlv"
          hint="O nome do proprietário no CRLV preenche o parceiro; placa e modelo opcionais para vincular veículo."
          disabled={loading}
          onParsed={({ campos }) => aplicarCrlv(campos)}
          onError={setError}
        />
        <Field label="Nome do parceiro (proprietário)">
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        {!editando ? (
          <>
            <label className="field checkbox-label">
              <input
                type="checkbox"
                checked={cadastrarVeiculo}
                onChange={(e) => setCadastrarVeiculo(e.target.checked)}
              />
              Cadastrar veículo do CRLV e vincular ao parceiro
            </label>
            {cadastrarVeiculo ? (
              <>
                <Field label="Placa">
                  <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} />
                </Field>
                <Field label="Marca / modelo">
                  <input className="input" value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} />
                </Field>
              </>
            ) : null}
          </>
        ) : null}
      </FormCard>
      <ResultPanel title="Resultado" data={result} />
    </>
  );
}
