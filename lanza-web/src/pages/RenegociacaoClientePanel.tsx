import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Field, FormCard } from "@/components/FormCard";
import { DateInput } from "@/components/DateInput";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl } from "@/lib/format";
import type { RenegociacaoInput, RenegociacaoParcela, RenegociacaoPreview, RenegociacaoResumo } from "@/api/types";

type Props = {
  clienteIdInicial?: string;
  placaInicial?: string;
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function hojeIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function gerarParcelasIguais(
  total: number,
  qtd: number,
  primeiraData: string,
  intervaloDias: number,
): RenegociacaoParcela[] {
  if (qtd < 1) return [];
  const base = Math.floor((total / qtd) * 100) / 100;
  let rest = total;
  const parcelas: RenegociacaoParcela[] = [];
  for (let i = 1; i <= qtd; i++) {
    const valor = i === qtd ? Math.round(rest * 100) / 100 : base;
    rest = Math.round((rest - valor) * 100) / 100;
    parcelas.push({
      numero: i,
      totalParcelas: qtd,
      valor,
      data: addDays(primeiraData, (i - 1) * intervaloDias),
    });
  }
  return parcelas;
}

function formatDataDebito(data?: string): string {
  if (!data) return "—";
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return data;
  return d.toLocaleDateString("pt-BR");
}

export function RenegociacaoClientePanel({ clienteIdInicial = "", placaInicial = "" }: Props) {
  const qc = useQueryClient();

  const [clienteId, setClienteId] = useState(clienteIdInicial);
  const [placa, setPlaca] = useState(placaInicial);
  const [apenasVencidos, setApenasVencidos] = useState(true);
  const [negociacaoCodigo, setNegociacaoCodigo] = useState("1");
  const [numParcelas, setNumParcelas] = useState("3");
  const [primeiraParcela, setPrimeiraParcela] = useState(hojeIso());
  const [intervaloDias, setIntervaloDias] = useState("7");

  const [loadingResumo, setLoadingResumo] = useState(false);
  const [resumoError, setResumoError] = useState<string | null>(null);
  const [resumo, setResumo] = useState<RenegociacaoResumo | null>(null);
  const [selIds, setSelIds] = useState<Set<string>>(new Set());
  const [parcelas, setParcelas] = useState<RenegociacaoParcela[]>([]);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RenegociacaoPreview | null>(null);

  const [loadingExec, setLoadingExec] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execResult, setExecResult] = useState<unknown>(null);

  const totalSelecionado = useMemo(() => {
    if (!resumo) return 0;
    return resumo.debitos
      .filter((d) => selIds.has(String(d.id)))
      .reduce((s, d) => s + d.total, 0);
  }, [resumo, selIds]);

  function montarInput(): RenegociacaoInput | null {
    if (!resumo) return null;
    const gastosIds = [...selIds].map((id) => {
      const n = Number(id);
      return Number.isFinite(n) && String(n) === id ? n : id;
    });
    return {
      negociacaoCodigo: negociacaoCodigo.trim(),
      gastosIds,
      motoristaKey: resumo.motoristaKey,
      rastreavelKey: resumo.rastreavelKey,
      parcelas,
    };
  }

  async function carregarResumo() {
    if (!clienteId.trim() || !placa.trim()) {
      setResumoError("Selecione cliente e placa.");
      return;
    }
    setLoadingResumo(true);
    setResumoError(null);
    setResumo(null);
    setPreview(null);
    setExecResult(null);
    try {
      const r = await lanzaApi.resumoRenegociacao({
        clienteId: clienteId.trim(),
        placa: placa.trim(),
        apenasVencidos,
      });
      setResumo(r);
      setSelIds(new Set(r.debitos.map((d) => String(d.id))));
      const qtd = Math.max(1, Number(numParcelas) || 1);
      setParcelas(
        gerarParcelasIguais(r.soma, qtd, primeiraParcela, Math.max(1, Number(intervaloDias) || 7)),
      );
    } catch (err) {
      setResumoError(err instanceof LanzaApiError ? err.message : "Falha ao carregar débitos.");
    } finally {
      setLoadingResumo(false);
    }
  }

  function toggleDebito(id: string | number) {
    const key = String(id);
    setSelIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPreview(null);
  }

  function regenerarParcelas() {
    const qtd = Math.max(1, Number(numParcelas) || 1);
    setParcelas(
      gerarParcelasIguais(
        totalSelecionado,
        qtd,
        primeiraParcela,
        Math.max(1, Number(intervaloDias) || 7),
      ),
    );
    setPreview(null);
  }

  async function fazerPreview() {
    const input = montarInput();
    if (!input || input.gastosIds.length === 0) {
      setPreviewError("Selecione ao menos um débito.");
      return;
    }
    if (!input.negociacaoCodigo) {
      setPreviewError("Informe o código da negociação.");
      return;
    }
    if (input.parcelas.length === 0) {
      setPreviewError("Gere as parcelas antes do preview.");
      return;
    }
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      const r = await lanzaApi.previewRenegociacao(input);
      setPreview(r);
    } catch (err) {
      setPreviewError(err instanceof LanzaApiError ? err.message : "Falha no preview.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function executar() {
    const input = montarInput();
    if (!input) return;
    if (!window.confirm("Confirmar renegociação no Rastreame? Esta ação grava no Gastos Gerais.")) {
      return;
    }
    setLoadingExec(true);
    setExecError(null);
    try {
      const r = await lanzaApi.executarRenegociacao(input);
      setExecResult(r);
      setPreview(r.preview);
      void qc.invalidateQueries({ queryKey: ["despesas-cliente"] });
    } catch (err) {
      setExecError(err instanceof LanzaApiError ? err.message : "Falha ao executar renegociação.");
    } finally {
      setLoadingExec(false);
    }
  }

  return (
    <section className="reneg-panel">
      <h2 className="form-card__title">Renegociação de débitos vencidos</h2>
      <p className="field__hint reneg-panel__intro">
        Marca débitos antigos com <code>[NEGOCIADO X]</code> no Rastreame e cria parcelas{" "}
        <code>DOCUMENTACAO</code>. Requer sync-cliente e sync-veículo com chaves Rastreame.
      </p>

      <FormCard
        title="1. Cliente e veículo"
        onSubmit={carregarResumo}
        loading={loadingResumo}
        submitLabel="Carregar débitos"
        error={resumoError}
      >
        <Field label="Cliente">
          <ClienteSelect
            value={clienteId}
            onChange={(v) => {
              setClienteId(v);
              setResumo(null);
              setPreview(null);
            }}
            ativo
            variant="cadastro"
            required
          />
        </Field>
        <Field label="Veículo">
          <VeiculoSelect
            value={placa}
            onChange={(v) => {
              setPlaca(v);
              setResumo(null);
              setPreview(null);
            }}
            clienteId={clienteId || undefined}
            ativo
            variant="cadastro"
            required
          />
        </Field>
        <label className="field checkbox-label">
          <input
            type="checkbox"
            checked={apenasVencidos}
            onChange={(e) => setApenasVencidos(e.target.checked)}
          />
          Só débitos vencidos (ATRASADO ou data passada)
        </label>
      </FormCard>

      {resumo ? (
        <>
          <section className="form-card">
            <h2 className="form-card__title">
              2. Débitos no Rastreame ({resumo.total}) · {formatBrl(resumo.soma)}
            </h2>
            {resumo.debitos.length === 0 ? (
              <p className="field__hint">Nenhum débito elegível para renegociação.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th />
                      <th>ID</th>
                      <th>Data</th>
                      <th>Descrição</th>
                      <th>Tipo</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.debitos.map((d) => (
                      <tr key={String(d.id)}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selIds.has(String(d.id))}
                            onChange={() => toggleDebito(d.id)}
                          />
                        </td>
                        <td>{String(d.id)}</td>
                        <td>{formatDataDebito(d.data)}</td>
                        <td>{d.info}</td>
                        <td>{d.tipo ?? "—"}</td>
                        <td className="num">{formatBrl(d.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={5}>
                        <strong>Selecionados</strong>
                      </td>
                      <td className="num">
                        <strong>{formatBrl(totalSelecionado)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className="form-card">
            <h2 className="form-card__title">3. Plano de parcelas</h2>
            <div className="form-grid">
              <Field label="Código negociação (X)" hint="Usado em [NEGOCIADO X]">
                <input
                  className="input"
                  value={negociacaoCodigo}
                  onChange={(e) => setNegociacaoCodigo(e.target.value)}
                />
              </Field>
              <Field label="Nº parcelas">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={numParcelas}
                  onChange={(e) => setNumParcelas(e.target.value)}
                />
              </Field>
              <Field label="1ª parcela">
                <DateInput value={primeiraParcela} onChange={setPrimeiraParcela} format="iso" />
              </Field>
              <Field label="Intervalo (dias)">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={intervaloDias}
                  onChange={(e) => setIntervaloDias(e.target.value)}
                />
              </Field>
            </div>
            <button type="button" className="btn btn--ghost" onClick={regenerarParcelas}>
              Recalcular parcelas ({formatBrl(totalSelecionado)})
            </button>
            {parcelas.length > 0 ? (
              <div className="table-wrap reneg-parcelas">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Parcela</th>
                      <th>Vencimento</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p) => (
                      <tr key={p.numero}>
                        <td>
                          {p.numero}x{p.totalParcelas}
                        </td>
                        <td>{formatDataDebito(p.data)}</td>
                        <td className="num">{formatBrl(p.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <div className="reneg-actions">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={loadingPreview || selIds.size === 0}
              onClick={() => void fazerPreview()}
            >
              {loadingPreview ? "A validar…" : "Preview (dry-run)"}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={loadingExec || selIds.size === 0 || !preview?.validacao.ok}
              onClick={() => void executar()}
            >
              {loadingExec ? "A executar…" : "Executar no Rastreame"}
            </button>
          </div>

          {previewError ? <p className="form-card__error">{previewError}</p> : null}
          {execError ? <p className="form-card__error">{execError}</p> : null}

          {preview ? (
            <section className="form-card">
              <h2 className="form-card__title">Validação</h2>
              <p className={preview.validacao.ok ? "badge badge--ok" : "badge badge--danger"}>
                Soma parcelas: {formatBrl(preview.validacao.soma)} · Diferença:{" "}
                {formatBrl(preview.validacao.diff)} ·{" "}
                {preview.validacao.ok ? "OK" : "Ajuste os valores antes de executar"}
              </p>
            </section>
          ) : null}

          <ResultPanel title="Resultado" data={execResult ?? preview} />
        </>
      ) : null}
    </section>
  );
}
