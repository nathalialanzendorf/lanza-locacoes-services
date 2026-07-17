import { useMemo, useState } from "react";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";
import type { PrestacaoVeiculoInput } from "@/api/types";

export function RelatorioPrestacaoContasForm() {
  const veiculosQuery = useVeiculos({ ativo: true });
  const [competencia, setCompetencia] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ganhoPadrao, setGanhoPadrao] = useState("2000");
  const [modoAvancado, setModoAvancado] = useState(false);
  const [veiculosJson, setVeiculosJson] = useState("[]");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    data?: unknown;
    textos?: { parceiro: string; texto: string }[];
    avisos?: string[];
    arquivos?: unknown;
  } | null>(null);

  const veiculos = veiculosQuery.data?.items ?? [];

  const payloadVeiculos = useMemo((): PrestacaoVeiculoInput[] => {
    if (modoAvancado) {
      try {
        return JSON.parse(veiculosJson) as PrestacaoVeiculoInput[];
      } catch {
        return [];
      }
    }
    return veiculos
      .filter((v) => v.placa && sel.has(v.id))
      .map((v) => ({
        placa: v.placa!,
        ganho: { valor: Number(ganhoPadrao) || 2000, descricao: "Locação semanal" },
        devidoMesAnterior: 0,
        descontoManutencao: { valor: 0, descricao: "" },
      }));
  }, [modoAvancado, veiculos, sel, ganhoPadrao, veiculosJson]);

  function toggleVeiculo(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selecionarTodos() {
    setSel(new Set(veiculos.map((v) => v.id)));
  }

  async function gerar() {
    setLoading(true);
    setError(null);
    try {
      if (!payloadVeiculos.length) throw new Error("Selecione ao menos um veículo.");
      const r = await lanzaApi.gerarPrestacaoContas({ competencia: competencia.trim(), veiculos: payloadVeiculos });
      const data = r.data as {
        textos?: { parceiro: string; texto: string }[];
        avisos?: string[];
        arquivos?: unknown;
      };
      setResult({ data: r.data, textos: data.textos, avisos: data.avisos, arquivos: data.arquivos });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : err instanceof Error ? err.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }

  const texto = result?.textos?.map((t) => `=== ${t.parceiro} ===\n${t.texto}`).join("\n\n");

  return (
    <>
      <FormCard title="Parâmetros" onSubmit={gerar} loading={loading} submitLabel="Gerar prestação de contas" error={error}>
        <Field label="Competência" hint="MM/AAAA">
          <input className="input" placeholder="07/2026" value={competencia} onChange={(e) => setCompetencia(e.target.value)} required />
        </Field>
        <Field label="Ganho padrão (R$)" hint="Por veículo selecionado">
          <input className="input" type="number" value={ganhoPadrao} onChange={(e) => setGanhoPadrao(e.target.value)} />
        </Field>
        <label className="field checkbox-label">
          <input type="checkbox" checked={modoAvancado} onChange={(e) => setModoAvancado(e.target.checked)} />
          Modo avançado (JSON manual)
        </label>
      </FormCard>

      {!modoAvancado ? (
        <section className="form-card">
          <div className="despesas-toolbar">
            <h2 className="form-card__title">Veículos ({sel.size}/{veiculos.length})</h2>
            <button type="button" className="btn btn--ghost" onClick={selecionarTodos}>
              Selecionar todos
            </button>
          </div>
          <div className="checkbox-group">
            {veiculos.map((v) => (
              <label key={v.id} className="checkbox-label">
                <input type="checkbox" checked={sel.has(v.id)} onChange={() => toggleVeiculo(v.id)} />
                {formatPlaca(v.placa)} {v.marcaModelo ? `· ${v.marcaModelo}` : ""}
              </label>
            ))}
          </div>
        </section>
      ) : (
        <Field label="Veículos (JSON)">
          <textarea className="textarea" rows={12} value={veiculosJson} onChange={(e) => setVeiculosJson(e.target.value)} />
        </Field>
      )}

      <ResultPanel title="Relatório gerado" texto={texto} data={result?.data ?? result} arquivos={result?.arquivos} />
    </>
  );
}
