import { useMemo, useState } from "react";
import { Field, FormCard } from "@/components/FormCard";
import { DateInput } from "@/components/DateInput";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { ResultPanel } from "@/components/ResultPanel";
import { useDespesasCliente, useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import type { LinhaPlanoBaixa, PlanoBaixa } from "@/api/types";
import { useRastreameEspelho } from "@/hooks/useRastreameEspelho";
import { formatBrl } from "@/lib/format";

const VALOR_MANUAL = "__manual__";

export function RecebimentosManualSection() {
  const { ativo: espelhoRastreame } = useRastreameEspelho();
  const veiculosQuery = useVeiculos({ ativo: true });
  const [veiculoId, setVeiculoId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [dataBr, setDataBr] = useState("");
  const [valorOpcao, setValorOpcao] = useState("");
  const [valor, setValor] = useState("");
  const [loadingPlano, setLoadingPlano] = useState(false);
  const [planoError, setPlanoError] = useState<string | null>(null);
  const [plano, setPlano] = useState<PlanoBaixa | null>(null);
  const [linhasSel, setLinhasSel] = useState<Set<number>>(new Set());
  const [loadingExec, setLoadingExec] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execResult, setExecResult] = useState<unknown>(null);

  const veiculoSel = useMemo(
    () => (veiculosQuery.data?.items ?? []).find((v) => v.id === veiculoId) ?? null,
    [veiculosQuery.data, veiculoId],
  );

  const despesasQuery = useDespesasCliente({
    emAberto: true,
    ativo: true,
    clienteId: clienteId || undefined,
    veiculoId: veiculoId || undefined,
  });

  const opcoesValor = useMemo(() => {
    return (despesasQuery.data?.items ?? [])
      .filter((d) => Number(d.valorMulta) > 0)
      .map((d) => ({
        id: d.id,
        valor: Number(d.valorMulta),
        label: `${formatBrl(Number(d.valorMulta))} · ${d.descricao ?? d.categoria ?? d.id}`,
      }));
  }, [despesasQuery.data]);

  const valorManual = valorOpcao === VALOR_MANUAL || !valorOpcao;

  function onVeiculoChange(id: string) {
    setVeiculoId(id);
    setValorOpcao("");
    setValor("");
    if (!id) return;
    const v = (veiculosQuery.data?.items ?? []).find((x) => x.id === id);
    if (v?.clienteVinculadoId) setClienteId(v.clienteVinculadoId);
  }

  function onClienteChange(id: string) {
    setClienteId(id);
    setValorOpcao("");
    setValor("");
    if (!id || !veiculoId) return;
    const v = (veiculosQuery.data?.items ?? []).find((x) => x.id === veiculoId);
    if (v?.clienteVinculadoId && v.clienteVinculadoId !== id) setVeiculoId("");
  }

  function onValorOpcaoChange(opcao: string) {
    setValorOpcao(opcao);
    if (opcao === VALOR_MANUAL || !opcao) {
      setValor("");
      return;
    }
    const item = opcoesValor.find((o) => o.id === opcao);
    if (item) setValor(String(item.valor));
  }

  async function montarPlano() {
    if (!clienteId.trim()) {
      setPlanoError("Selecione um cliente.");
      return;
    }
    const valorNum = Number(valor);
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      setPlanoError("Informe o valor recebido.");
      return;
    }
    if (!dataBr.trim()) {
      setPlanoError("Informe a data do crédito.");
      return;
    }

    setLoadingPlano(true);
    setPlanoError(null);
    setPlano(null);
    setExecResult(null);
    try {
      const r = await lanzaApi.montarPlanoRecebimento({
        clienteQuery: clienteId.trim(),
        valor: valorNum,
        dataBr: dataBr.trim(),
        placa: veiculoSel?.placa?.trim() || undefined,
      });
      setPlano(r.data);
      setLinhasSel(new Set(r.data.linhas.map((l) => l.num)));
    } catch (err) {
      setPlanoError(err instanceof LanzaApiError ? err.message : "Falha ao montar plano.");
    } finally {
      setLoadingPlano(false);
    }
  }

  function toggleLinha(num: number) {
    setLinhasSel((prev) => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  }

  async function executar() {
    if (!plano) return;
    setLoadingExec(true);
    setExecError(null);
    try {
      const linhas = plano.linhas.filter((l) => linhasSel.has(l.num));
      const r = await lanzaApi.executarRecebimento({ linhas, syncRastreame: espelhoRastreame });
      setExecResult(r.data);
    } catch (err) {
      setExecError(err instanceof LanzaApiError ? err.message : "Falha ao executar baixa.");
    } finally {
      setLoadingExec(false);
    }
  }

  return (
    <>
      <FormCard
        title="Montar plano de baixa"
        onSubmit={montarPlano}
        loading={loadingPlano}
        submitLabel="Montar plano"
        error={planoError}
      >
        <div className="form-grid">
          <Field label="Veículo" hint="Opcional — filtra débitos e vincula ao cliente">
            <VeiculoSelect
              value={veiculoId}
              onChange={onVeiculoChange}
              valueField="id"
              ativo
              clienteId={clienteId || undefined}
              disabled={loadingPlano}
              emptyLabel="Qualquer veículo"
            />
          </Field>
          <Field label="Cliente">
            <ClienteSelect
              value={clienteId}
              onChange={onClienteChange}
              ativo
              required
              disabled={loadingPlano}
              emptyLabel="Selecione o cliente"
            />
          </Field>
          <Field label="Data do crédito">
            <DateInput value={dataBr} onChange={setDataBr} required disabled={loadingPlano} />
          </Field>
          <Field
            label="Valor recebido (R$)"
            hint={
              clienteId
                ? "Débitos em aberto do cliente ou valor manual"
                : "Selecione o cliente para sugerir valores"
            }
          >
            <select
              className="select"
              value={valorOpcao}
              onChange={(e) => onValorOpcaoChange(e.target.value)}
              disabled={loadingPlano || !clienteId || despesasQuery.isLoading}
              aria-label="Valor sugerido"
            >
              <option value="">
                {!clienteId
                  ? "Selecione o cliente"
                  : despesasQuery.isLoading
                    ? "A carregar débitos…"
                    : opcoesValor.length
                      ? "Selecione um débito em aberto"
                      : "Nenhum débito em aberto"}
              </option>
              {opcoesValor.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              <option value={VALOR_MANUAL}>Outro valor…</option>
            </select>
            {valorManual ? (
              <input
                className="input"
                type="number"
                step="0.01"
                min={0}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
                disabled={loadingPlano}
                placeholder="0,00"
              />
            ) : (
              <p className="field__hint">{formatBrl(Number(valor) || 0)}</p>
            )}
          </Field>
        </div>
      </FormCard>

      {plano ? (
        <section className="form-card">
          <h2 className="form-card__title">Confirmar linhas ({plano.linhas.length})</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th />
                  <th>#</th>
                  <th>Operação</th>
                  <th>Placa</th>
                  <th>Auto</th>
                </tr>
              </thead>
              <tbody>
                {plano.linhas.map((l: LinhaPlanoBaixa) => (
                  <tr key={l.num}>
                    <td>
                      <input type="checkbox" checked={linhasSel.has(l.num)} onChange={() => toggleLinha(l.num)} />
                    </td>
                    <td>{l.num}</td>
                    <td>{l.operacao}</td>
                    <td>{l.rastreavel}</td>
                    <td>{l.autoInfracao ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field__hint">Valor: {formatBrl(Number(valor) || 0)}</p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={loadingExec || linhasSel.size === 0}
            onClick={() => void executar()}
          >
            {loadingExec ? "A aplicar…" : `Executar baixa (${linhasSel.size})`}
          </button>
          {execError ? <p className="form-card__error">{execError}</p> : null}
        </section>
      ) : null}

      <ResultPanel title="Baixa aplicada" data={execResult} />
    </>
  );
}
