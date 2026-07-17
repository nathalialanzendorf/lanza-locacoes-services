import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

type Props = {
  locacaoId?: string;
};

export function MovimentacaoCadastroSection({ locacaoId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
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
        <Field label="Veículo">
          <VeiculoSelect value={veiculoPlaca} onChange={setVeiculoPlaca} required disabled={loading} />
        </Field>
        <Field label="Situação">
          <select className="select" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="locado">Locado</option>
            <option value="reserva">Reserva</option>
            <option value="manutencao">Manutenção</option>
          </select>
        </Field>
        {situacao === "locado" ? (
          <Field label="Tipo de locação">
            <select className="select" value={tipoLocacao} onChange={(e) => setTipoLocacao(e.target.value)}>
              <option value="diaria">Diária</option>
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
            </select>
          </Field>
        ) : null}
        <Field label="Início" hint="DD/MM/AAAA">
          <input className="input" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
        </Field>
        <Field label="Fim (opcional)" hint="DD/MM/AAAA">
          <input className="input" value={fim} onChange={(e) => setFim(e.target.value)} />
        </Field>
        <Field label="Cliente">
          <ClienteSelect
            value={clienteId}
            onChange={setClienteId}
            disabled={loading}
            emptyLabel="— Sem cliente —"
          />
        </Field>
        <Field label="Observação">
          <input className="input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Field>
      </FormCard>
      <ResultPanel title="Movimentação gravada" data={result} />
    </>
  );
}
