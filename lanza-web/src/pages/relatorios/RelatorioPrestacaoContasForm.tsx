import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/FormCard";
import { Toggle } from "@/components/Toggle";
import { ParceiroSelect, VeiculoSelect } from "@/components/EntitySelects";
import { RelatorioEntrega } from "@/components/relatorios/RelatorioEntrega";
import {
  PERIODO_VAZIO,
  RelatorioPeriodoFiltro,
  type RelatorioPeriodo,
} from "@/components/relatorios/RelatorioPeriodoFiltro";
import { ResultPanel } from "@/components/ResultPanel";
import { useContratos, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatBrl, formatPlaca, formatVeiculoLabel } from "@/lib/format";
import {
  calcularGanhosVeiculos,
  type GanhoVeiculoLinha,
} from "@/lib/prestacaoGanho";
import type { PrestacaoVeiculoInput } from "@/api/types";
import {
  downloadArquivoTexto,
  downloadPdfViaImpressao,
  textoPrestacaoContas,
  type RelatorioModoEntrega,
} from "@/lib/relatorioDownload";
import {
  competenciaDeDataBr,
  periodoValido,
  ultimoDiaMesBr,
} from "@/lib/periodoRelatorio";

function competenciaDoPeriodo(periodo: RelatorioPeriodo): string | null {
  const ini = periodo.dataInicial.trim();
  if (!ini) return null;
  return competenciaDeDataBr(ini);
}

function periodoPrestacaoValido(periodo: RelatorioPeriodo): boolean {
  if (!periodo.dataInicial.trim()) return false;
  if (!periodoValido(periodo)) return false;
  const compIni = competenciaDeDataBr(periodo.dataInicial);
  const compFim = periodo.dataFinal.trim() ? competenciaDeDataBr(periodo.dataFinal) : compIni;
  return Boolean(compIni && compFim && compIni === compFim);
}

export function RelatorioPrestacaoContasForm() {
  const [parceiroId, setParceiroId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const veiculosQuery = useVeiculos({ ativo: true });
  const contratosQuery = useContratos();
  const vinculosQuery = useVinculosParceiro(
    parceiroId.trim() ? { parceiroId: parceiroId.trim() } : undefined,
  );

  const [periodo, setPeriodo] = useState<RelatorioPeriodo>(PERIODO_VAZIO);
  const competencia = competenciaDoPeriodo(periodo) ?? "";
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [ganhos, setGanhos] = useState<GanhoVeiculoLinha[]>([]);
  const [ganhosConfirmados, setGanhosConfirmados] = useState(false);
  const [calculandoGanhos, setCalculandoGanhos] = useState(false);
  const [modoAvancado, setModoAvancado] = useState(false);
  const [veiculosJson, setVeiculosJson] = useState("[]");
  const [armazenarServidor, setArmazenarServidor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [textoVisivel, setTextoVisivel] = useState<string | undefined>();
  const [avisos, setAvisos] = useState<string[] | undefined>();

  function onPeriodoChange(next: RelatorioPeriodo) {
    let dataFinal = next.dataFinal;
    if (next.dataInicial.trim() && !next.dataFinal.trim()) {
      dataFinal = ultimoDiaMesBr(next.dataInicial) ?? "";
    }
    setPeriodo({ dataInicial: next.dataInicial, dataFinal });
  }

  const veiculosFiltrados = useMemo(() => {
    let list = veiculosQuery.data?.items ?? [];
    if (parceiroId.trim()) {
      const ids = new Set((vinculosQuery.data?.items ?? []).map((v) => v.veiculoId));
      list = list.filter((v) => ids.has(v.id));
    }
    if (veiculoId.trim()) {
      list = list.filter((v) => v.id === veiculoId.trim());
    }
    return list.filter((v) => v.placa?.trim());
  }, [veiculosQuery.data, vinculosQuery.data, parceiroId, veiculoId]);

  useEffect(() => {
    const visiveis = new Set(veiculosFiltrados.map((v) => v.id));
    setSel((prev) => {
      const next = new Set([...prev].filter((id) => visiveis.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [veiculosFiltrados]);

  useEffect(() => {
    if (veiculoId && parceiroId) {
      const ok = (vinculosQuery.data?.items ?? []).some((v) => v.veiculoId === veiculoId);
      if (!ok) setVeiculoId("");
    }
  }, [parceiroId, veiculoId, vinculosQuery.data]);

  useEffect(() => {
    setGanhosConfirmados(false);
  }, [competencia, sel, parceiroId, veiculoId]);

  useEffect(() => {
    if (modoAvancado || !periodoPrestacaoValido(periodo) || sel.size === 0) {
      setGanhos([]);
      return;
    }

    let cancel = false;
    setCalculandoGanhos(true);
    void lanzaApi
      .sugerirLocacoesPrestacao({ competencia: competencia.trim() })
      .then((r) => {
        if (cancel) return;
        const sugestoes = r.data?.veiculos ?? [];
        setGanhos(
          calcularGanhosVeiculos({
            veiculos: veiculosFiltrados,
            selecionados: sel,
            contratos: contratosQuery.data?.items ?? [],
            sugestoes,
          }),
        );
      })
      .catch(() => {
        if (cancel) return;
        setGanhos(
          calcularGanhosVeiculos({
            veiculos: veiculosFiltrados,
            selecionados: sel,
            contratos: contratosQuery.data?.items ?? [],
          }),
        );
      })
      .finally(() => {
        if (!cancel) setCalculandoGanhos(false);
      });

    return () => {
      cancel = true;
    };
  }, [modoAvancado, periodo, sel, veiculosFiltrados, contratosQuery.data, competencia]);

  const payloadVeiculos = useMemo((): PrestacaoVeiculoInput[] => {
    if (modoAvancado) {
      try {
        return JSON.parse(veiculosJson) as PrestacaoVeiculoInput[];
      } catch {
        return [];
      }
    }
    if (!ganhosConfirmados) return [];
    return ganhos.map((g) => ({
      placa: g.placa,
      ganho: g.itens?.length
        ? { itens: g.itens, valor: g.valor, descricao: g.descricao }
        : { valor: g.valor, descricao: g.descricao },
      devidoMesAnterior: 0,
      descontoManutencao: g.descontoManutencao ?? { valor: 0, descricao: "" },
    }));
  }, [modoAvancado, ganhos, ganhosConfirmados, veiculosJson]);

  function toggleVeiculo(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selecionarTodos() {
    setSel(new Set(veiculosFiltrados.map((v) => v.id)));
  }

  function onParceiroChange(id: string) {
    setParceiroId(id);
    setVeiculoId("");
  }

  function atualizarGanho(veiculoIdLinha: string, valor: number) {
    setGanhosConfirmados(false);
    setGanhos((prev) =>
      prev.map((g) => (g.veiculoId === veiculoIdLinha ? { ...g, valor: Math.max(0, valor) } : g)),
    );
  }

  function confirmarGanhos() {
    if (ganhos.some((g) => g.valor <= 0)) {
      setError("Há veículo com ganho zero — ajuste o valor ou remova da seleção.");
      return;
    }
    setError(null);
    setGanhosConfirmados(true);
  }

  async function entregar(modo: RelatorioModoEntrega) {
    if (!modoAvancado && !ganhosConfirmados) {
      setError("Confirme os ganhos antes de gerar o relatório.");
      return;
    }
    setLoading(true);
    setError(null);
    if (modo !== "visualizar") {
      setResult(null);
      setTextoVisivel(undefined);
      setAvisos(undefined);
    }
    try {
      if (!periodo.dataInicial.trim()) {
        throw new Error("Informe a data inicial do período (competência).");
      }
      if (!periodoPrestacaoValido(periodo)) {
        throw new Error("Período inválido — use datas do mesmo mês (competência).");
      }
      if (!payloadVeiculos.length) throw new Error("Selecione ao menos um veículo e confirme os ganhos.");
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

  const temFiltro = Boolean(parceiroId || veiculoId);
  const loadingVeiculos = veiculosQuery.isLoading || (parceiroId ? vinculosQuery.isLoading : false);
  const podeConfirmarGanhos =
    !modoAvancado &&
    periodoPrestacaoValido(periodo) &&
    sel.size > 0 &&
    ganhos.length > 0 &&
    !calculandoGanhos;

  return (
    <>
      <section className="form-card">
        <h2 className="form-card__title">Parâmetros</h2>
        <div className="form-grid">
          <Field label="Veículo" hint="Filtrar frota ativa">
            <VeiculoSelect
              value={veiculoId}
              onChange={setVeiculoId}
              valueField="id"
              ativo
              parceiroId={parceiroId || undefined}
              variant="filtro"
            />
          </Field>
          <RelatorioPeriodoFiltro
            value={periodo}
            onChange={onPeriodoChange}
            hint="Competência mensal — início e fim do mesmo mês"
          />
          {competencia ? (
            <Field label="Competência" hint="Derivada do período">
              <input className="input" value={competencia} readOnly aria-readonly />
            </Field>
          ) : null}
          <Field label="Parceiro" hint="Opcional">
            <ParceiroSelect value={parceiroId} onChange={onParceiroChange} ativo variant="filtro" />
          </Field>
          <Toggle
            className="field"
            checked={modoAvancado}
            onChange={setModoAvancado}
            label="Modo avançado (JSON manual)"
          />
        </div>
        {!loadingVeiculos ? (
          <p className="field__hint">
            {veiculosFiltrados.length} veículo{veiculosFiltrados.length === 1 ? "" : "s"} na lista
            {temFiltro ? " (filtrados)" : ""}.
          </p>
        ) : null}
        {error ? <p className="form-card__error">{error}</p> : null}
      </section>

      {!modoAvancado ? (
        <>
          <section className="form-card">
            <div className="despesas-toolbar">
              <h2 className="form-card__title">Veículos ({sel.size}/{veiculosFiltrados.length})</h2>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={selecionarTodos}
                disabled={veiculosFiltrados.length === 0}
              >
                Selecionar todos
              </button>
            </div>
            {loadingVeiculos ? (
              <p className="field__hint">A carregar veículos…</p>
            ) : veiculosFiltrados.length === 0 ? (
              <p className="field__hint">
                {temFiltro ? "Nenhum veículo ativo corresponde aos filtros." : "Nenhum veículo ativo."}
              </p>
            ) : (
              <div className="toggle-group">
                {veiculosFiltrados.map((v) => (
                  <Toggle
                    key={v.id}
                    checked={sel.has(v.id)}
                    onChange={() => toggleVeiculo(v.id)}
                    label={formatVeiculoLabel(v)}
                  />
                ))}
              </div>
            )}
          </section>

          {sel.size > 0 && periodoPrestacaoValido(periodo) ? (
            <section className="form-card">
              <div className="despesas-toolbar">
                <h2 className="form-card__title">Ganhos sugeridos</h2>
                {ganhosConfirmados ? (
                  <span className="badge badge--ok">Confirmado</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={!podeConfirmarGanhos}
                    onClick={confirmarGanhos}
                  >
                    Confirmar ganhos
                  </button>
                )}
              </div>
              {calculandoGanhos ? (
                <p className="field__hint">A calcular ganhos (locações e contratos)…</p>
              ) : (
                <>
                  <p className="field__hint">
                    Valores de locações no período ou, se não houver movimentação, 4 semanas do contrato vigente.
                    Ajuste se necessário e confirme antes de gerar.
                  </p>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Placa</th>
                          <th>Origem</th>
                          <th>Referência</th>
                          <th className="num">Ganho (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ganhos.map((g) => (
                          <tr key={g.veiculoId}>
                            <td>
                              <strong>{formatPlaca(g.placa)}</strong>
                            </td>
                            <td>{g.origem === "locacoes" ? "Locações" : "Contrato"}</td>
                            <td>
                              <span className="field__hint" title={g.descricao}>
                                {g.contratoCliente ?? g.descricao}
                              </span>
                            </td>
                            <td className="num">
                              <input
                                className="input"
                                type="number"
                                min={0}
                                step="0.01"
                                value={g.valor}
                                onChange={(e) => atualizarGanho(g.veiculoId, Number(e.target.value))}
                                disabled={ganhosConfirmados}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3}>
                            <strong>Total</strong>
                          </td>
                          <td className="num">
                            <strong>{formatBrl(ganhos.reduce((s, g) => s + g.valor, 0))}</strong>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </section>
          ) : null}
        </>
      ) : (
        <Field label="Veículos (JSON)">
          <textarea className="textarea" rows={12} value={veiculosJson} onChange={(e) => setVeiculosJson(e.target.value)} />
        </Field>
      )}

      <RelatorioEntrega
        loading={loading}
        disabled={
          !periodo.dataInicial.trim() ||
          !periodoPrestacaoValido(periodo) ||
          payloadVeiculos.length === 0 ||
          (!modoAvancado && !ganhosConfirmados)
        }
        armazenarServidor={armazenarServidor}
        onArmazenarServidorChange={setArmazenarServidor}
        onEntrega={(modo) => void entregar(modo)}
      />

      <ResultPanel title="Visualização" texto={textoVisivel} data={result} arquivos={avisos?.length ? avisos : undefined} />
    </>
  );
}
