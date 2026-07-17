import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useRastreameEspelho } from "@/hooks/useRastreameEspelho";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { LABEL } from "@/lib/labels";

export function ClientesImportLoteSection() {
  const qc = useQueryClient();
  const { ativo: espelhoRastreame } = useRastreameEspelho();
  const [raizCnh, setRaizCnh] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function importarCnh() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.importarCnh({
        raiz: raizCnh.trim() || undefined,
        dryRun,
        comRastreame: espelhoRastreame && !dryRun,
      });
      setResult(r);
      if (!dryRun) void qc.invalidateQueries({ queryKey: ["clientes"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha na importação CNH.");
    } finally {
      setLoading(false);
    }
  }

  async function previewCnh() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.previewImportacaoCnh(raizCnh.trim() || undefined);
      setResult(r);
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha no preview CNH.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CadastroBackLink to="/clientes" />
      <FormCard
        title="Importar clientes (CNH em lote)"
        onSubmit={importarCnh}
        loading={loading}
        submitLabel={dryRun ? "Simular" : LABEL.importar}
        error={error}
      >
        <Field label="Raiz documentos" hint="Pasta Aluguel Carros (opcional — usa config)">
          <input className="input" value={raizCnh} onChange={(e) => setRaizCnh(e.target.value)} />
        </Field>
        <label className="field checkbox-label">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Dry-run (simular)
        </label>
      </FormCard>
      <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => void previewCnh()}>
        {LABEL.consultar}
      </button>
      <ResultPanel title="Resultado" data={result} />
    </>
  );
}
