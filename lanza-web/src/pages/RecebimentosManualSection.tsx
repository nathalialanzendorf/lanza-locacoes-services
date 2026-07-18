import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Field, FormCard } from "@/components/FormCard";
import { DateInput } from "@/components/DateInput";
import { ClienteSelect, VeiculoSelect, NativeSelect } from "@/components/EntitySelects";
import { ResultPanel } from "@/components/ResultPanel";
import { Toggle } from "@/components/Toggle";
import { useDespesasCliente, useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import type { LinhaPlanoBaixa, PlanoBaixa } from "@/api/types";
import { useRastreameEspelho } from "@/hooks/useRastreameEspelho";
import { formatBrl } from "@/lib/format";

const VALOR_MANUAL = "__manual__";

const ROTULO_TIPO_BAIXA: Record<NonNullable<PlanoBaixa["tipoBaixa"]>, string> = {
  integral: "Baixa integral",
  parcial: "Baixa parcial",
  integral_desconto: "Baixa integral com desconto",
};

function compactPlaca(placa: string): string {
  return placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function rotuloEfeitoLinha(l: LinhaPlanoBaixa): string {
  const patch = l.patch ?? {};
  if (l.operacao === "criar" && patch.paga === true) return "Quitado (valor pago)";
  if (l.operacao === "criar") return "Nova parcela em aberto";
  if (l.operacao === "atualizar" && patch.paga === true) return "Quitado";
  if (l.operacao === "atualizar") return "Saldo em atraso";
  return "—";
}

export function RecebimentosManualSection() {
  const [searchParams] = useSearchParams();
  const clienteIdUrl = searchParams.get("clienteId")?.trim() || "";
  const placaUrl = searchParams.get("placa")?.trim() || "";
  const valorUrl = searchParams.get("valor")?.trim() || "";
  const dataBrUrl = searchParams.get("dataBr")?.trim() || "";

  const { ativo: espelhoRastreame } = useRastreameEspelho();
  const veiculosQuery = useVeiculos({ ativo: true });
  const [veiculoId, setVeiculoId] = useState("");
  const [clienteId, setClienteId] = useState(clienteIdUrl);
  const [dataBr, setDataBr] = useState(dataBrUrl);
  const [valorOpcao, setValorOpcao] = useState(valorUrl ? VALOR_MANUAL : "");
  const [valor, setValor] = useState(valorUrl);
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
        autoInfracao: d.autoInfracao?.trim() || d.id,
        valor: Number(d.valorMulta),
        label: `${formatBrl(Number(d.valorMulta))} · ${d.descricao ?? d.categoria ?? d.id}`,
      }));
  }, [despesasQuery.data]);

  const despesaSel = useMemo(() => {
    if (!valorOpcao || valorOpcao === VALOR_MANUAL) return null;
    return opcoesValor.find((o) => o.id === valorOpcao) ?? null;
  }, [valorOpcao, opcoesValor]);

  const valorParcialHint = useMemo(() => {
    if (!despesaSel) return null;
    const pago = Number(valor);
    if (!Number.isFinite(pago) || pago <= 0) return null;
    const diff = Math.round((despesaSel.valor - pago) * 100) / 100;
    if (diff < 0.01) return null;
    return `Parcial: ${formatBrl(pago)} quitado + ${formatBrl(diff)} permanece em atraso na mesma pendência.`;
  }, [despesaSel, valor]);

  useEffect(() => {
    if (clienteIdUrl) setClienteId(clienteIdUrl);
  }, [clienteIdUrl]);

  useEffect(() => {
    if (dataBrUrl) setDataBr(dataBrUrl);
  }, [dataBrUrl]);

  useEffect(() => {
    if (!valorUrl) return;
    setValorOpcao(VALOR_MANUAL);
    setValor(valorUrl);
  }, [valorUrl]);

  useEffect(() => {
    if (!placaUrl || !veiculosQuery.data) return;
    const alvo = compactPlaca(placaUrl);
    const v = (veiculosQuery.data.items ?? []).find(
      (x) => x.placa && compactPlaca(x.placa) === alvo,
    );
    if (v) setVeiculoId(v.id);
  }, [placaUrl, veiculosQuery.data]);

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
        autoInfracaoAlvo: despesaSel?.autoInfracao,
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
        className="form-card--compact"
        title="Montar plano de baixa"
        onSubmit={montarPlano}
        loading={loadingPlano}
        submitLabel="Montar plano"
        error={planoError}
      >
        <Field label="Veículo" hint="Opcional — filtra débitos e vincula ao cliente">
          <VeiculoSelect
            value={veiculoId}
            onChange={onVeiculoChange}
            valueField="id"
            ativo
            clienteId={clienteId || undefined}
            disabled={loadingPlano}
            variant="filtro"
          />
        </Field>
        <Field label="Cliente">
          <ClienteSelect
            value={clienteId}
            onChange={onClienteChange}
            ativo
            variant="cadastro"
            required
            disabled={loadingPlano}
          />
        </Field>
        <Field label="Data do crédito">
          <DateInput value={dataBr} onChange={setDataBr} required disabled={loadingPlano} />
        </Field>
        <Field
          label="Valor recebido (R$)"
          span="wide"
          hint={
            clienteId
              ? "Pendência em aberto sugere o valor — pode ajustar o recebido"
              : "Selecione o cliente para listar pendências"
          }
        >
          <div className="recebimentos-valor-campos">
            <NativeSelect
              value={valorOpcao}
              onChange={onValorOpcaoChange}
              variant="cadastro"
              disabled={loadingPlano || !clienteId || despesasQuery.isLoading}
              loading={Boolean(clienteId && despesasQuery.isLoading)}
              aria-label="Pendência em aberto"
            >
              {opcoesValor.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
              <option value={VALOR_MANUAL}>Outro valor…</option>
            </NativeSelect>
            <input
              className="input"
              type="number"
              step="0.01"
              min={0}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              required
              disabled={loadingPlano || !clienteId}
              placeholder="0,00"
              aria-label="Valor recebido"
            />
          </div>
          {valorParcialHint ? <p className="field__hint">{valorParcialHint}</p> : null}
        </Field>
      </FormCard>

      {plano ? (
        <section className="form-card">
          <h2 className="form-card__title">Confirmar linhas ({plano.linhas.length})</h2>
          {plano.tipoBaixa ? (
            <p className="field__hint">
              <strong>{ROTULO_TIPO_BAIXA[plano.tipoBaixa]}</strong>
              {plano.despesaAlvo
                ? ` · devido ${formatBrl(plano.despesaAlvo.valorDevido)} · recebido ${formatBrl(plano.pagamento?.valor ?? (Number(valor) || 0))}`
                : null}
            </p>
          ) : null}
          {plano.avisos?.map((a) => (
            <p key={a} className="field__hint">
              {a}
            </p>
          ))}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th />
                  <th>#</th>
                  <th>Operação</th>
                  <th>Descrição</th>
                  <th>Efeito</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {plano.linhas.map((l: LinhaPlanoBaixa) => (
                  <tr key={l.num}>
                    <td>
                      <Toggle
                        checked={linhasSel.has(l.num)}
                        onChange={() => toggleLinha(l.num)}
                        size="compact"
                        aria-label={`Selecionar linha ${l.num}`}
                      />
                    </td>
                    <td>{l.num}</td>
                    <td>{l.operacao}</td>
                    <td>{l.descricao ?? "—"}</td>
                    <td>{rotuloEfeitoLinha(l)}</td>
                    <td className="num">{formatBrl(l.total ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="field__hint">Valor recebido: {formatBrl(Number(valor) || 0)}</p>
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
