import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { VeiculoSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

export function DespesaParceiroOperacoesSection() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const [baixaPlaca, setBaixaPlaca] = useState("");
  const [baixaCat, setBaixaCat] = useState("IPVA");
  const [baixaComp, setBaixaComp] = useState("");

  async function baixa() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.baixaDespesaParceiro({
        placa: baixaPlaca.trim(),
        categoria: baixaCat.trim(),
        competencia: baixaComp.trim() || undefined,
      });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["despesas-parceiro"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha na baixa.");
    } finally {
      setLoading(false);
    }
  }

  async function rastreador() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.lancarRastreadorParceiro({ dryRun: false });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["despesas-parceiro"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao lançar rastreador.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CadastroBackLink to="/despesas/parceiro" />
      <FormCard title="Baixa de despesa" onSubmit={baixa} loading={loading} submitLabel="Dar baixa" error={error}>
        <Field label="Veículo">
          <VeiculoSelect value={baixaPlaca} onChange={setBaixaPlaca} required variant="cadastro" disabled={loading} />
        </Field>
        <Field label="Categoria">
          <input className="input" value={baixaCat} onChange={(e) => setBaixaCat(e.target.value)} required />
        </Field>
        <Field label="Competência">
          <input className="input" value={baixaComp} onChange={(e) => setBaixaComp(e.target.value)} />
        </Field>
      </FormCard>

      <button type="button" className="btn btn--primary" disabled={loading} onClick={() => void rastreador()}>
        Lançar rastreador fixo (frota)
      </button>

      <ResultPanel title="Resultado" data={result} />
    </>
  );
}
