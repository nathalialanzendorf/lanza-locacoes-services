import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { DateInput } from "@/components/DateInput";
import { QueryError } from "@/components/PageHeader";
import { ResultPanel } from "@/components/ResultPanel";
import { useContratos, useClientes } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca, clienteExibicaoPorId } from "@/lib/format";
import type { Contrato } from "@/api/types";

type MotivoEncerramento = "devolvido" | "recuperado" | "troca";

function terminoContrato(contrato: Contrato): string {
  if (contrato.dataEncerramento?.trim()) return contrato.dataEncerramento;
  if (contrato.dataFimPrevista?.trim()) return contrato.dataFimPrevista;
  return contrato.dataFim ?? "—";
}

export function ContratosEncerrarSection() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const contratoIdUrl = searchParams.get("id")?.trim() || null;
  const [clienteId, setClienteId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState<string | null>(contratoIdUrl);
  const [dataEncerramento, setDataEncerramento] = useState("");
  const [motivo, setMotivo] = useState<MotivoEncerramento>("devolvido");
  const [quebraContrato, setQuebraContrato] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const query = useContratos({
    status: "ativo",
    clienteId: clienteId || undefined,
    veiculoId: veiculoId || undefined,
  });
  const clientesQuery = useClientes();

  const rows = query.data?.items ?? [];
  const temFiltro = Boolean(clienteId || veiculoId);

  const contratoSelecionado = useMemo(
    () => rows.find((c) => c.id === contratoSelecionadoId) ?? null,
    [rows, contratoSelecionadoId],
  );

  useEffect(() => {
    if (contratoIdUrl) setContratoSelecionadoId(contratoIdUrl);
  }, [contratoIdUrl]);

  useEffect(() => {
    if (query.isLoading || !contratoSelecionadoId) return;
    if (!rows.some((c) => c.id === contratoSelecionadoId)) {
      setContratoSelecionadoId(null);
      if (contratoIdUrl) {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("id");
            return next;
          },
          { replace: true },
        );
      }
    }
  }, [rows, contratoSelecionadoId, query.isLoading, contratoIdUrl, setSearchParams]);

  useEffect(() => {
    if (motivo === "troca") setQuebraContrato(false);
  }, [motivo]);

  function selecionarContrato(contrato: Contrato) {
    setContratoSelecionadoId(contrato.id);
    setResult(null);
    setError(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("id", contrato.id);
        return next;
      },
      { replace: true },
    );
  }

  async function submit() {
    if (!contratoSelecionado) {
      setError("Selecione um contrato na lista.");
      return;
    }
    if (!dataEncerramento.trim()) {
      setError("Informe a data de encerramento.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.encerrarContrato({
        idOuPasta: contratoSelecionado.id,
        dataEncerramento: dataEncerramento.trim(),
        motivoEncerramento: motivo,
        quebraContrato: motivo === "troca" ? false : quebraContrato,
      });
      setResult(r.data);
      setContratoSelecionadoId(null);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("id");
          return next;
        },
        { replace: true },
      );
      void qc.invalidateQueries({ queryKey: ["contratos"] });
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao encerrar contrato.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="form-card">
        <h2 className="form-card__title">Contratos ativos</h2>
        <div className="despesas-toolbar">
          <ClienteSelect
            value={clienteId}
            onChange={setClienteId}
            ativo
            emptyLabel="Todos os clientes ativos"
          />
          <VeiculoSelect
            value={veiculoId}
            onChange={setVeiculoId}
            valueField="id"
            ativo
            emptyLabel="Todos os veículos ativos"
          />
          {!query.isLoading ? (
            <span className="badge badge--muted">
              {rows.length} contrato{rows.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
        {query.isError ? (
          <QueryError
            message={
              query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar contratos."
            }
          />
        ) : null}
        <p className="field__hint">Selecione o contrato a encerrar.</p>
        <DataTable
          loading={query.isLoading}
          rows={rows}
          keyFn={(c) => c.id}
          selectedKey={contratoSelecionadoId}
          onRowClick={selecionarContrato}
          emptyMessage={
            temFiltro ? "Nenhum contrato ativo corresponde aos filtros." : "Nenhum contrato ativo."
          }
          columns={[
            {
              key: "sel",
              header: "",
              className: "col-sel",
              render: (c) => (
                <input
                  type="radio"
                  name="contrato-encerrar"
                  checked={contratoSelecionadoId === c.id}
                  onChange={() => selecionarContrato(c)}
                  aria-label={`Selecionar contrato ${formatPlaca(c.placa)}`}
                />
              ),
            },
            {
              key: "cliente",
              header: "Cliente",
              render: (c) => (
                <strong>
                  {clienteExibicaoPorId(clientesQuery.data?.items, c.clienteId, c.clienteNome)}
                </strong>
              ),
            },
            {
              key: "placa",
              header: "Placa",
              render: (c) => formatPlaca(c.placa ?? c.veiculo?.placa),
            },
            { key: "inicio", header: "Início", render: (c) => c.dataInicio ?? "—" },
            { key: "termino", header: "Término previsto", render: (c) => terminoContrato(c) },
          ]}
        />
      </section>

      {contratoSelecionado ? (
        <p className="field__hint">
          Selecionado:{" "}
          <strong>
            {clienteExibicaoPorId(
              clientesQuery.data?.items,
              contratoSelecionado.clienteId,
              contratoSelecionado.clienteNome,
            )}
          </strong>{" "}
          ·{" "}
          {formatPlaca(contratoSelecionado.placa)}
        </p>
      ) : null}

      <FormCard
        title="Efetivar encerramento"
        onSubmit={submit}
        loading={loading}
        submitDisabled={!contratoSelecionado}
        submitLabel="Encerrar contrato"
        error={error}
      >
        <Field label="Data de encerramento">
          <DateInput value={dataEncerramento} onChange={setDataEncerramento} required disabled={loading} />
        </Field>
        <Field label="Motivo do encerramento">
          <select
            className="select"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoEncerramento)}
            disabled={loading}
          >
            <option value="devolvido">Devolvido</option>
            <option value="recuperado">Recuperado</option>
            <option value="troca">Troca de veículo</option>
          </select>
        </Field>
        <Field label="Quebra de contrato">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={quebraContrato}
              onChange={(e) => setQuebraContrato(e.target.checked)}
              disabled={loading || motivo === "troca"}
            />
            Registrar quebra (retenção proporcional de caução)
          </label>
          {motivo === "troca" ? (
            <span className="field__hint">Troca de veículo não é quebra — a caução transfere para o novo contrato.</span>
          ) : null}
        </Field>
      </FormCard>

      <ResultPanel title="Contrato encerrado" data={result} />
    </>
  );
}
