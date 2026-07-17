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
  veiculoId?: string;
};

export function VeiculosCadastroSection({ veiculoId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editando = Boolean(veiculoId);

  const [placa, setPlaca] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [anoModelo, setAnoModelo] = useState("");
  const [chassi, setChassi] = useState("");
  const [renavam, setRenavam] = useState("");
  const [cor, setCor] = useState("");
  const [ufRegistro, setUfRegistro] = useState("SC");
  const [parceiroNome, setParceiroNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [carregando, setCarregando] = useState(editando);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  function aplicarCrlv(campos: Record<string, unknown>) {
    if (typeof campos.placa === "string") setPlaca(campos.placa);
    if (typeof campos.marcaModelo === "string") setMarcaModelo(campos.marcaModelo);
    if (typeof campos.anoModelo === "string") setAnoModelo(campos.anoModelo);
    if (typeof campos.chassi === "string") setChassi(campos.chassi);
    if (typeof campos.renavam === "string") setRenavam(campos.renavam);
    if (typeof campos.cor === "string") setCor(campos.cor);
    if (typeof campos.ufRegistro === "string") setUfRegistro(campos.ufRegistro);
    if (typeof campos.proprietarioNome === "string" && campos.proprietarioNome.trim()) {
      setParceiroNome(campos.proprietarioNome.trim());
    }
  }

  function popularFormulario(v: Record<string, unknown>) {
    if (typeof v.placa === "string") setPlaca(v.placa);
    if (typeof v.marcaModelo === "string") setMarcaModelo(v.marcaModelo);
    if (typeof v.anoModelo === "string") setAnoModelo(v.anoModelo);
    if (typeof v.chassi === "string") setChassi(v.chassi);
    if (typeof v.renavam === "string") setRenavam(v.renavam);
    if (typeof v.cor === "string") setCor(v.cor);
    if (typeof v.ufRegistro === "string") setUfRegistro(v.ufRegistro);
    if (typeof v.parceiroNome === "string") setParceiroNome(v.parceiroNome);
    if (typeof v.ativo === "boolean") setAtivo(v.ativo);
  }

  useEffect(() => {
    if (!veiculoId) return;
    let cancelado = false;
    setCarregando(true);
    setError(null);
    void lanzaApi
      .obterVeiculo(veiculoId)
      .then((r) => {
        if (cancelado) return;
        popularFormulario(r.data as unknown as Record<string, unknown>);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err instanceof LanzaApiError ? err.message : "Falha ao carregar veículo.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [veiculoId]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        placa: placa.trim(),
        marcaModelo: marcaModelo.trim() || undefined,
        anoModelo: anoModelo.trim() || undefined,
        chassi: chassi.trim() || undefined,
        renavam: renavam.trim() || undefined,
        cor: cor.trim() || undefined,
        ufRegistro: ufRegistro.trim() || undefined,
        parceiroNome: parceiroNome.trim() || undefined,
        ativo,
        ...(editando ? {} : { origem: "web-upload-crlv" }),
      };

      const r = editando
        ? await lanzaApi.atualizarVeiculo(veiculoId!, body)
        : await lanzaApi.criarVeiculo(body);

      setResult(r);
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
      void qc.invalidateQueries({ queryKey: ["parceiros"] });
      navigate("/veiculos");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar veículo.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to="/veiculos" />
        <p className="muted">A carregar veículo…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to="/veiculos" />
      <FormCard
        title={editando ? "Editar veículo" : "Novo veículo"}
        onSubmit={submit}
        loading={loading}
        submitLabel={editando ? "Salvar alterações" : "Gravar veículo"}
        error={error}
      >
        <DocUploadField
          label="CRLV (PDF)"
          tipo="crlv"
          hint="Envie o PDF do CRLV para preencher placa, modelo, chassi e proprietário."
          disabled={loading}
          onParsed={({ campos }) => aplicarCrlv(campos)}
          onError={setError}
        />
        <Field label="Placa">
          <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} required />
        </Field>
        <Field label="Marca / modelo">
          <input className="input" value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} />
        </Field>
        <Field label="Ano / modelo">
          <input
            className="input"
            value={anoModelo}
            onChange={(e) => setAnoModelo(e.target.value)}
            placeholder="2012/2013"
          />
        </Field>
        <Field label="Chassi">
          <input className="input" value={chassi} onChange={(e) => setChassi(e.target.value)} />
        </Field>
        <Field label="RENAVAM">
          <input className="input" value={renavam} onChange={(e) => setRenavam(e.target.value)} />
        </Field>
        <Field label="Cor">
          <input className="input" value={cor} onChange={(e) => setCor(e.target.value)} />
        </Field>
        <Field label="UF registro">
          <input className="input" value={ufRegistro} onChange={(e) => setUfRegistro(e.target.value)} />
        </Field>
        <Field label="Parceiro (proprietário)">
          <input className="input" value={parceiroNome} onChange={(e) => setParceiroNome(e.target.value)} />
        </Field>
        <Field label="Ativo">
          <label className="checkbox-label">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Veículo ativo na frota
          </label>
        </Field>
      </FormCard>
      <ResultPanel title="Veículo gravado" data={result} />
    </>
  );
}
