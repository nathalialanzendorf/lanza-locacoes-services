import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DocUploadField } from "@/components/DocUploadField";
import { matchParceiroIdPorNome, ParceiroSelect, VeiculoSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useParceiros } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

export function VeiculosToolsSection() {
  const qc = useQueryClient();
  const parceirosQuery = useParceiros();
  const [placaFipe, setPlacaFipe] = useState("");
  const [placa, setPlaca] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [anoModelo, setAnoModelo] = useState("");
  const [chassi, setChassi] = useState("");
  const [renavam, setRenavam] = useState("");
  const [cor, setCor] = useState("");
  const [ufRegistro, setUfRegistro] = useState("SC");
  const [parceiroId, setParceiroId] = useState("");
  const [loadingFipe, setLoadingFipe] = useState(false);
  const [loadingCrlv, setLoadingCrlv] = useState(false);
  const [loadingPastas, setLoadingPastas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [atualizarFipeAposGravar, setAtualizarFipeAposGravar] = useState(true);

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

  async function atualizarFipe() {
    if (!placaFipe.trim()) {
      setError("Selecione o veículo para atualizar FIPE.");
      return;
    }
    setLoadingFipe(true);
    setError(null);
    try {
      const r = await lanzaApi.atualizarFipeVeiculo(placaFipe.trim());
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao atualizar FIPE.");
    } finally {
      setLoadingFipe(false);
    }
  }

  async function gravarCrlvUpload() {
    if (!placa.trim()) {
      setError("Placa obrigatória — envie o CRLV ou informe manualmente.");
      return;
    }
    setLoadingCrlv(true);
    setError(null);
    try {
      const r = await lanzaApi.criarVeiculo({
        placa: placa.trim(),
        marcaModelo: marcaModelo.trim() || undefined,
        anoModelo: anoModelo.trim() || undefined,
        chassi: chassi.trim() || undefined,
        renavam: renavam.trim() || undefined,
        cor: cor.trim() || undefined,
        ufRegistro: ufRegistro.trim() || undefined,
        parceiroId: parceiroId.trim() || undefined,
        origem: "web-upload-crlv-fipe",
      });
      let fipeResult: unknown = null;
      if (atualizarFipeAposGravar) {
        try {
          fipeResult = await lanzaApi.atualizarFipeVeiculo(placa.trim());
        } catch (fipeErr) {
          fipeResult = {
            aviso: fipeErr instanceof LanzaApiError ? fipeErr.message : "FIPE não atualizado",
          };
        }
      }
      setResult({ veiculo: r, fipe: fipeResult });
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
      void qc.invalidateQueries({ queryKey: ["parceiros"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar dados do CRLV.");
    } finally {
      setLoadingCrlv(false);
    }
  }

  async function importarCrlvPastas() {
    setLoadingPastas(true);
    setError(null);
    try {
      const r = await lanzaApi.importarCrlv({ placa: placa.trim() || undefined });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao importar CRLV das pastas.");
    } finally {
      setLoadingPastas(false);
    }
  }

  const busy = loadingFipe || loadingCrlv || loadingPastas;

  return (
    <>
      <FormCard
        title="Atualizar FIPE"
        onSubmit={atualizarFipe}
        loading={loadingFipe}
        submitLabel="Consultar FIPE"
        error={error}
      >
        <Field label="Veículo" hint="Veículo já cadastrado no Lanza">
          <VeiculoSelect value={placaFipe} onChange={setPlacaFipe} required disabled={busy} />
        </Field>
      </FormCard>

      <FormCard
        title="CRLV — upload (PDF)"
        onSubmit={gravarCrlvUpload}
        loading={loadingCrlv}
        submitLabel="Gravar no Lanza"
        error={busy && !loadingCrlv ? null : error}
      >
        <DocUploadField
          label="Enviar CRLV"
          tipo="crlv"
          hint="PDF com texto (CRLV digital). Confira os campos antes de gravar."
          disabled={busy}
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
            disabled={busy}
            emptyLabel="— Sem parceiro —"
          />
        </Field>
        <label className="field checkbox-label">
          <input
            type="checkbox"
            checked={atualizarFipeAposGravar}
            onChange={(e) => setAtualizarFipeAposGravar(e.target.checked)}
          />
          Atualizar FIPE após gravar
        </label>
      </FormCard>

      <div className="despesas-toolbar">
        <VeiculoSelect
          value={placa}
          onChange={setPlaca}
          allowEmpty
          emptyLabel="Todas as placas (importação)"
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => void importarCrlvPastas()}
        >
          {loadingPastas ? "A importar…" : "Importar CRLV das pastas (Dropbox)"}
        </button>
      </div>

      <ResultPanel title="Resultado" data={result} />
    </>
  );
}

