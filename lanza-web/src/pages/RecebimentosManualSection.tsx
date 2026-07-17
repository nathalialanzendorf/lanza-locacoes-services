import { useState } from "react";
import { Field, FormCard } from "@/components/FormCard";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import type { LinhaPlanoBaixa, PlanoBaixa } from "@/api/types";
import { useRastreameEspelho } from "@/hooks/useRastreameEspelho";
import { formatBrl } from "@/lib/format";

export function RecebimentosManualSection() {
  const { ativo: espelhoRastreame } = useRastreameEspelho();
  const [clienteId, setClienteId] = useState("");
  const [valor, setValor] = useState("");
  const [dataBr, setDataBr] = useState("");
  const [placa, setPlaca] = useState("");
  const [loadingPlano, setLoadingPlano] = useState(false);
  const [planoError, setPlanoError] = useState<string | null>(null);
  const [plano, setPlano] = useState<PlanoBaixa | null>(null);
  const [linhasSel, setLinhasSel] = useState<Set<number>>(new Set());
  const [loadingExec, setLoadingExec] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execResult, setExecResult] = useState<unknown>(null);

  async function montarPlano() {
    setLoadingPlano(true);
    setPlanoError(null);
    setPlano(null);
    setExecResult(null);
    try {
      const r = await lanzaApi.montarPlanoRecebimento({
        clienteQuery: clienteId.trim(),
        valor: Number(valor),
        dataBr: dataBr.trim(),
        placa: placa.trim() || undefined,
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
        <Field label="Cliente">
          <ClienteSelect value={clienteId} onChange={setClienteId} required disabled={loadingPlano} />
        </Field>
        <Field label="Valor recebido (R$)">
          <input className="input" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
        </Field>
        <Field label="Data do crédito" hint="DD/MM/AAAA">
          <input className="input" value={dataBr} onChange={(e) => setDataBr(e.target.value)} required />
        </Field>
        <Field label="Veículo (opcional)">
          <VeiculoSelect
            value={placa}
            onChange={setPlaca}
            clienteId={clienteId || undefined}
            disabled={loadingPlano}
            emptyLabel="— Qualquer veículo —"
          />
        </Field>
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
