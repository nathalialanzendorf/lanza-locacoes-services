import { useMemo, useState } from "react";
import { Field } from "@/components/FormCard";
import { RelatorioEntrega } from "@/components/relatorios/RelatorioEntrega";
import { ResultPanel } from "@/components/ResultPanel";
import { useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";
import type { PrestacaoVeiculoInput } from "@/api/types";
import {
  downloadArquivoTexto,
  downloadPdfViaImpressao,
  textoPrestacaoContas,
  type RelatorioModoEntrega,
} from "@/lib/relatorioDownload";

export function RelatorioPrestacaoContasForm() {
  const veiculosQuery = useVeiculos({ ativo: true });
  const [competencia, setCompetencia] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ganhoPadrao, setGanhoPadrao] = useState("2000");
  const [modoAvancado, setModoAvancado] = useState(false);
  const [veiculosJson, setVeiculosJson] = useState("[]");
  const [armazenarServidor, setArmazenarServidor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [textoVisivel, setTextoVisivel] = useState<string | undefined>();
  const [avisos, setAvisos] = useState<string[] | undefined>();

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

  async function entregar(modo: RelatorioModoEntrega) {
    setLoading(true);
    setError(null);
    if (modo !== "visualizar") {
      setResult(null);
      setTextoVisivel(undefined);
      setAvisos(undefined);
    }
    try {
      if (!competencia.trim()) throw new Error("Informe a competência (MM/AAAA).");
      if (!payloadVeiculos.length) throw new Error("Selecione ao menos um veículo.");
      const r = await lanzaApi.gerarPrestacaoContas({
        competencia: competencia.trim(),
        veiculos: payloadVeiculos,
        armazenarServidor,
      });
      const payload = r.data as {
        textos?: { parceiro: string; texto: string }[];
        avisos?: string[];
        arquivos?: unknown;
      };
      const texto = textoPrestacaoContas(payload);
      if (!texto.trim()) throw new Error("Relatório vazio.");
      const nome = `prestacao-${competencia.replace(/\//g, "-")}`;
      if (modo === "visualizar") {
        setResult(payload);
        setTextoVisivel(texto);
        setAvisos(payload.avisos);
      } else if (modo === "txt") {
        downloadArquivoTexto(nome, texto);
      } else {
        downloadPdfViaImpressao(nome, texto);
      }
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : err instanceof Error ? err.message : "Erro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="form-card">
        <h2 className="form-card__title">Parâmetros</h2>
        <div className="form-grid">
          <Field label="Competência" hint="MM/AAAA">
            <input
              className="input"
              placeholder="07/2026"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              required
            />
          </Field>
          <Field label="Ganho padrão (R$)" hint="Por veículo selecionado">
            <input className="input" type="number" value={ganhoPadrao} onChange={(e) => setGanhoPadrao(e.target.value)} />
          </Field>
          <label className="field checkbox-label">
            <input type="checkbox" checked={modoAvancado} onChange={(e) => setModoAvancado(e.target.checked)} />
            Modo avançado (JSON manual)
          </label>
        </div>
        {error ? <p className="form-card__error">{error}</p> : null}
      </section>

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

      <RelatorioEntrega
        loading={loading}
        disabled={!competencia.trim() || payloadVeiculos.length === 0}
        armazenarServidor={armazenarServidor}
        onArmazenarServidorChange={setArmazenarServidor}
        onEntrega={(modo) => void entregar(modo)}
      />

      <ResultPanel title="Visualização" texto={textoVisivel} data={result} arquivos={avisos?.length ? avisos : undefined} />
    </>
  );
}
