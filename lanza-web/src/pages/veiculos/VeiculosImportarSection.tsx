import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { DocUploadField } from "@/components/DocUploadField";
import { matchParceiroIdPorNome, ParceiroSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { useParceiros } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

export function VeiculosImportarSection() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const parceirosQuery = useParceiros();

  const [placa, setPlaca] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [anoModelo, setAnoModelo] = useState("");
  const [chassi, setChassi] = useState("");
  const [renavam, setRenavam] = useState("");
  const [cor, setCor] = useState("");
  const [ufRegistro, setUfRegistro] = useState("SC");
  const [parceiroId, setParceiroId] = useState("");
  const [atualizarFipe, setAtualizarFipe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function aplicarCrlv(campos: Record<string, unknown>) {
    if (typeof campos.placa === "string") setPlaca(campos.placa);
    if (typeof campos.marcaModelo === "string") setMarcaModelo(campos.marcaModelo);
    if (typeof campos.anoModelo === "string") setAnoModelo(campos.anoModelo);
    if (typeof campos.chassi === "string") setChassi(campos.chassi);
    if (typeof campos.renavam === "string") setRenavam(campos.renavam);
    if (typeof campos.cor === "string") setCor(campos.cor);
    if (typeof campos.ufRegistro === "string") setUfRegistro(campos.ufRegistro);
    if (typeof campos.proprietarioNome === "string" && campos.proprietarioNome.trim()) {
      const id = matchParceiroIdPorNome(parceirosQuery.data?.items, campos.proprietarioNome.trim());
      if (id) setParceiroId(id);
    }
  }

  async function salvar() {
    if (!placa.trim()) {
      setError("Placa obrigatória — envie o CRLV ou informe manualmente.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await lanzaApi.criarVeiculo({
        placa: placa.trim(),
        marcaModelo: marcaModelo.trim() || undefined,
        anoModelo: anoModelo.trim() || undefined,
        chassi: chassi.trim() || undefined,
        renavam: renavam.trim() || undefined,
        cor: cor.trim() || undefined,
        ufRegistro: ufRegistro.trim() || undefined,
        parceiroId: parceiroId.trim() || undefined,
        origem: "web-importar-crlv",
      });

      if (atualizarFipe) {
        try {
          await lanzaApi.atualizarFipeVeiculo(placa.trim());
        } catch {
          /* FIPE opcional após importação */
        }
      }

      void qc.invalidateQueries({ queryKey: ["veiculos"] });
      void qc.invalidateQueries({ queryKey: ["parceiros"] });
      navigate("/veiculos");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao salvar veículo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CadastroBackLink to="/veiculos" />
      <FormCard title="Importar CRLV" onSubmit={salvar} loading={loading} error={error}>
        <DocUploadField
          label="CRLV (PDF)"
          tipo="crlv"
          hint="Envie o PDF do CRLV para preencher os campos automaticamente."
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
          <ParceiroSelect
            value={parceiroId}
            onChange={setParceiroId}
            disabled={loading}
            emptyLabel="— Sem parceiro —"
          />
        </Field>
        <label className="field checkbox-label">
          <input type="checkbox" checked={atualizarFipe} onChange={(e) => setAtualizarFipe(e.target.checked)} />
          Consultar FIPE após salvar
        </label>
      </FormCard>
    </>
  );
}
