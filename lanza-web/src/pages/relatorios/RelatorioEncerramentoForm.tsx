import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/DataTable";
import { ClienteSelect, VeiculoSelect, NativeSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { DateInput } from "@/components/DateInput";
import { QueryError } from "@/components/PageHeader";
import { RelatorioEntrega } from "@/components/relatorios/RelatorioEntrega";
import { ResultPanel } from "@/components/ResultPanel";
import { Toggle } from "@/components/Toggle";
import { useContratos, useClientes } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import {
  downloadArquivoTexto,
  downloadPdfViaImpressao,
  textoEncerramento,
  type RelatorioModoEntrega,
} from "@/lib/relatorioDownload";
import { formatPlaca, clienteExibicaoPorId } from "@/lib/format";
import type { Contrato } from "@/api/types";

type EncerramentoPayload = {
  data?: unknown;
  whatsapp?: string;
  texto?: string;
  avisos?: string[];
  arquivos?: unknown;
};

type MotivoEncerramento = "devolvido" | "recuperado" | "troca";

function normalizarEncerramento(r: EncerramentoPayload & { data?: EncerramentoPayload }): EncerramentoPayload {
  if (r.texto != null || r.whatsapp != null) return r;
  if (r.data && typeof r.data === "object" && ("texto" in r.data || "whatsapp" in r.data)) {
    return r.data as EncerramentoPayload;
  }
  return r;
}

function pastaDoContrato(contrato: Contrato): string {
  return contrato.pastaContrato ?? contrato.pasta ?? "";
}

function terminoContrato(contrato: Contrato): string {
  if (contrato.dataEncerramento?.trim()) return contrato.dataEncerramento;
  if (contrato.dataFimPrevista?.trim()) return contrato.dataFimPrevista;
  return contrato.dataFim ?? "—";
}

export function RelatorioEncerramentoForm() {
  const qc = useQueryClient();
  const [clienteId, setClienteId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState<string | null>(null);

  const [dataEncerramento, setDataEncerramento] = useState("");
  const [semanasPagas, setSemanasPagas] = useState("");
  const [armazenarServidor, setArmazenarServidor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EncerramentoPayload | null>(null);

  const [motivo, setMotivo] = useState<MotivoEncerramento>("devolvido");
  const [quebraContrato, setQuebraContrato] = useState(false);
  const [loadingEncerrar, setLoadingEncerrar] = useState(false);
  const [encerrarResult, setEncerrarResult] = useState<unknown>(null);
  const [encerrarError, setEncerrarError] = useState<string | null>(null);

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

  const pastaContrato = contratoSelecionado ? pastaDoContrato(contratoSelecionado) : "";

  useEffect(() => {
    if (contratoSelecionadoId && !rows.some((c) => c.id === contratoSelecionadoId)) {
      setContratoSelecionadoId(null);
    }
  }, [rows, contratoSelecionadoId]);

  useEffect(() => {
    if (motivo === "troca") setQuebraContrato(false);
  }, [motivo]);

  const paramsValidos = Boolean(pastaContrato.trim() && dataEncerramento.trim());

  function selecionarContrato(contrato: Contrato) {
    setContratoSelecionadoId(contrato.id);
    setResult(null);
    setEncerrarResult(null);
    setError(null);
    setEncerrarError(null);
  }

  async function entregar(modo: RelatorioModoEntrega) {
    if (!contratoSelecionado) {
      setError("Selecione um contrato na lista.");
      return;
    }
    setLoading(true);
    setError(null);
    if (modo !== "visualizar") setResult(null);
    try {
      const bruto = await lanzaApi.gerarEncerramento({
        pastaContrato: pastaContrato.trim(),
        dataEncerramento: dataEncerramento.trim(),
        semanasPagas: semanasPagas.trim() ? Number(semanasPagas) : undefined,
        armazenarServidor,
      });
      const payload = normalizarEncerramento(bruto as EncerramentoPayload & { data?: EncerramentoPayload });
      const texto = textoEncerramento(payload);
      if (!texto.trim()) throw new Error("Relatório vazio.");
      const nome = `encerramento-${dataEncerramento.replace(/\//g, "-")}`;
      if (modo === "visualizar") {
        setResult(payload);
      } else if (modo === "txt") {
        downloadArquivoTexto(nome, texto);
      } else {
        downloadPdfViaImpressao(nome, texto);
      }
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : err instanceof Error ? err.message : "Falha ao calcular encerramento.");
    } finally {
      setLoading(false);
    }
  }

  async function efetivarEncerramento() {
    if (!contratoSelecionado) {
      setEncerrarError("Selecione um contrato na lista.");
      return;
    }
    if (!dataEncerramento.trim()) {
      setEncerrarError("Informe a data de encerramento.");
      return;
    }
    setLoadingEncerrar(true);
    setEncerrarError(null);
    try {
      const r = await lanzaApi.encerrarContrato({
        idOuPasta: contratoSelecionado.id,
        dataEncerramento: dataEncerramento.trim(),
        motivoEncerramento: motivo,
        quebraContrato: motivo === "troca" ? false : quebraContrato,
      });
      setEncerrarResult(r.data);
      setContratoSelecionadoId(null);
      void qc.invalidateQueries({ queryKey: ["contratos"] });
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
    } catch (err) {
      setEncerrarError(err instanceof LanzaApiError ? err.message : "Falha ao encerrar contrato.");
    } finally {
      setLoadingEncerrar(false);
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
            variant="filtro"
          />
          <VeiculoSelect
            value={veiculoId}
            onChange={setVeiculoId}
            valueField="id"
            ativo
            variant="filtro"
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
        <p className="field__hint">Clique num contrato para selecionar e calcular o acerto ou encerrar.</p>
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
                  name="contrato-encerramento"
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
            {
              key: "inicio",
              header: "Início",
              render: (c) => c.dataInicio ?? "—",
            },
            {
              key: "termino",
              header: "Término previsto",
              render: (c) => terminoContrato(c),
            },
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
          {formatPlaca(contratoSelecionado.placa)} · {pastaContrato || contratoSelecionado.id}
        </p>
      ) : null}

      <section className="form-card">
        <h2 className="form-card__title">Calcular acerto final</h2>
        <div className="form-grid">
          <Field label="Data de encerramento">
            <DateInput value={dataEncerramento} onChange={setDataEncerramento} required disabled={loading} />
          </Field>
          <Field label="Semanas pagas (opcional)">
            <input
              className="input"
              type="number"
              min={0}
              value={semanasPagas}
              onChange={(e) => setSemanasPagas(e.target.value)}
              disabled={!contratoSelecionado || loading}
            />
          </Field>
        </div>
        {error ? <p className="form-card__error">{error}</p> : null}
      </section>

      <RelatorioEntrega
        loading={loading}
        disabled={!paramsValidos || !contratoSelecionado}
        armazenarServidor={armazenarServidor}
        onArmazenarServidorChange={setArmazenarServidor}
        onEntrega={(modo) => void entregar(modo)}
      />

      <ResultPanel
        title="Visualização"
        whatsapp={result?.whatsapp}
        texto={result?.texto}
        data={result?.data}
        arquivos={result?.arquivos}
      />

      <FormCard
        title="Efetivar encerramento"
        onSubmit={efetivarEncerramento}
        loading={loadingEncerrar}
        submitDisabled={!contratoSelecionado}
        submitLabel="Encerrar contrato no database"
        error={encerrarError}
      >
        <Field label="Data de encerramento" hint="Usa a mesma data do acerto acima">
          <DateInput value={dataEncerramento} onChange={setDataEncerramento} required disabled={loadingEncerrar} />
        </Field>
        <Field label="Motivo do encerramento">
          <NativeSelect
            value={motivo}
            onChange={(v) => setMotivo(v as MotivoEncerramento)}
            variant="cadastro"
            allowEmpty={false}
            disabled={loadingEncerrar}
            aria-label="Motivo do encerramento"
          >
            <option value="devolvido">Devolvido</option>
            <option value="recuperado">Recuperado</option>
            <option value="troca">Troca de veículo</option>
          </NativeSelect>
        </Field>
        <Field label="Quebra de contrato">
          <Toggle
            checked={quebraContrato}
            onChange={setQuebraContrato}
            disabled={loadingEncerrar || motivo === "troca"}
            label="Registrar quebra (retenção proporcional de caução)"
          />
          {motivo === "troca" ? (
            <span className="field__hint">Troca de veículo não é quebra — a caução transfere para o novo contrato.</span>
          ) : null}
        </Field>
      </FormCard>

      <ResultPanel title="Contrato encerrado" data={encerrarResult} />
    </>
  );
}
