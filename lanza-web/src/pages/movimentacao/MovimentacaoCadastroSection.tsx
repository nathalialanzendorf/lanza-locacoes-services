import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { DateInput } from "@/components/DateInput";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

type Props = {
  locacaoId?: string;
};

function normPlaca(placa?: string | null): string {
  return (placa ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function MovimentacaoCadastroSection({ locacaoId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const veiculosQuery = useVeiculos();
  const editando = Boolean(locacaoId);

  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [situacao, setSituacao] = useState("locado");
  const [tipoLocacao, setTipoLocacao] = useState("semanal");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [carregando, setCarregando] = useState(editando);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => {
    if (!locacaoId) return;
    let cancelado = false;
    setCarregando(true);
    setError(null);
    void lanzaApi
      .obterLocacao(locacaoId)
      .then((r) => {
        if (cancelado) return;
        const l = r.data as Record<string, unknown>;
        if (typeof l.placa === "string") setVeiculoPlaca(l.placa);
        if (typeof l.situacao === "string") setSituacao(l.situacao);
        if (typeof l.tipoLocacao === "string") setTipoLocacao(l.tipoLocacao);
        if (typeof l.inicio === "string") setInicio(l.inicio);
        if (typeof l.fim === "string") setFim(l.fim);
        if (typeof l.clienteId === "string") setClienteId(l.clienteId);
        if (typeof l.observacao === "string") setObservacao(l.observacao);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err instanceof LanzaApiError ? err.message : "Falha ao carregar movimentação.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [locacaoId]);

  function onVeiculoChange(placa: string) {
    setVeiculoPlaca(placa);
    if (!placa) return;
    const v = (veiculosQuery.data?.items ?? []).find((x) => normPlaca(x.placa) === normPlaca(placa));
    if (v?.clienteVinculadoId) setClienteId(v.clienteVinculadoId);
  }

  function onClienteChange(id: string) {
    setClienteId(id);
    if (!id || !veiculoPlaca) return;
    const v = (veiculosQuery.data?.items ?? []).find((x) => normPlaca(x.placa) === normPlaca(veiculoPlaca));
    if (v?.clienteVinculadoId && v.clienteVinculadoId !== id) setVeiculoPlaca("");
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        placa: veiculoPlaca.trim(),
        situacao,
        inicio: inicio.trim(),
        fim: fim.trim() || null,
        clienteId: clienteId.trim() || null,
        tipoLocacao: situacao === "locado" ? tipoLocacao : null,
        observacao: observacao.trim() || null,
      };

      const r = editando
        ? await lanzaApi.atualizarLocacao(locacaoId!, body)
        : await lanzaApi.salvarLocacao(body);

      setResult(r);
      void qc.invalidateQueries({ queryKey: ["locacoes"] });
      navigate("/movimentacao");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar movimentação.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to="/movimentacao" />
        <p className="muted">A carregar movimentação…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to="/movimentacao" />
      <FormCard
        title={editando ? "Editar movimentação" : "Nova movimentação"}
        onSubmit={submit}
        loading={loading}
        error={error}
      >
        <div className="form-grid">
          <Field label="Veículo">
            <VeiculoSelect
              value={veiculoPlaca}
              onChange={onVeiculoChange}
              clienteId={clienteId || undefined}
              required
              disabled={loading}
            />
          </Field>
          <Field label="Cliente">
            <ClienteSelect value={clienteId} onChange={onClienteChange} disabled={loading} />
          </Field>
          <Field label="Tipo">
            <select
              className="select"
              value={situacao}
              onChange={(e) => setSituacao(e.target.value)}
              disabled={loading}
              aria-label="Tipo"
            >
              <option value="locado">Locado</option>
              <option value="reserva">Reserva</option>
              <option value="manutencao">Manutenção</option>
            </select>
          </Field>
        </div>
        {situacao === "locado" ? (
          <Field label="Tipo de locação">
            <select
              className="select"
              value={tipoLocacao}
              onChange={(e) => setTipoLocacao(e.target.value)}
              disabled={loading}
            >
              <option value="diaria">Diária</option>
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
            </select>
          </Field>
        ) : null}
        <Field label="Início">
          <DateInput value={inicio} onChange={setInicio} required disabled={loading} />
        </Field>
        <Field label="Fim (opcional)">
          <DateInput value={fim} onChange={setFim} disabled={loading} />
        </Field>
        <Field label="Observação">
          <input className="input" value={observacao} onChange={(e) => setObservacao(e.target.value)} disabled={loading} />
        </Field>
      </FormCard>
      <ResultPanel title="Movimentação gravada" data={result} />
    </>
  );
}
