import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

export function DespesaParceiroActionsPanel() {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const [placa, setPlaca] = useState("");
  const [categoria, setCategoria] = useState("IPVA");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [competencia, setCompetencia] = useState("");

  const [baixaPlaca, setBaixaPlaca] = useState("");
  const [baixaCat, setBaixaCat] = useState("IPVA");
  const [baixaComp, setBaixaComp] = useState("");

  async function criar() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.criarDespesaParceiro({
        placa: placa.trim(),
        categoria: categoria.trim(),
        descricao: descricao.trim(),
        valor: Number(valor),
        competencia: competencia.trim() || undefined,
      });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["despesas-parceiro"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao criar despesa parceiro.");
    } finally {
      setLoading(false);
    }
  }

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
    <section className="reneg-panel">
      <h2 className="form-card__title">Operações parceiro</h2>
      <FormCard title="Nova despesa parceiro" onSubmit={criar} loading={loading} submitLabel="Gravar" error={error}>
        <Field label="Placa">
          <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} required />
        </Field>
        <Field label="Categoria">
          <input className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} required />
        </Field>
        <Field label="Descrição">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
        <Field label="Valor">
          <input className="input" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
        </Field>
        <Field label="Competência" hint="MM/AAAA">
          <input className="input" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </Field>
      </FormCard>

      <FormCard title="Baixa de despesa" onSubmit={baixa} loading={loading} submitLabel="Dar baixa" error={null}>
        <Field label="Placa">
          <input className="input" value={baixaPlaca} onChange={(e) => setBaixaPlaca(e.target.value)} required />
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
    </section>
  );
}
