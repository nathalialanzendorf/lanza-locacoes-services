import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { DataTable } from "@/components/DataTable";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { QueryError } from "@/components/PageHeader";
import { ContratosCadastroSection } from "@/pages/contratos/ContratosCadastroSection";
import { useClientes, useContratos } from "@/api/hooks";
import { LanzaApiError } from "@/api/client";
import { formatPlaca, clienteExibicaoPorId } from "@/lib/format";
import {
  PROXIMO_VENCER_DIAS,
  alertaVencimentoContrato,
  dataFimPrevistaContrato,
  hojeIsoBr,
  ordenarContratosRenovacao,
  rotuloAlertaVencimento,
  rowClassVencimentoContrato,
} from "@/lib/contratoVencimento";
import type { Contrato } from "@/api/types";

export function ContratosRenovarSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const contratoIdUrl = searchParams.get("id")?.trim() || null;
  const [clienteId, setClienteId] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState<string | null>(contratoIdUrl);

  const query = useContratos({
    status: "ativo",
    clienteId: clienteId || undefined,
    veiculoId: veiculoId || undefined,
  });
  const clientesQuery = useClientes();
  const hojeIso = hojeIsoBr();

  const rows = useMemo(() => {
    const list = [...(query.data?.items ?? [])];
    list.sort((a, b) => ordenarContratosRenovacao(a, b, hojeIso));
    return list;
  }, [query.data, hojeIso]);

  const resumo = useMemo(() => {
    let vencidos = 0;
    let proximos = 0;
    for (const c of rows) {
      const a = alertaVencimentoContrato(dataFimPrevistaContrato(c), hojeIso);
      if (a === "vencido") vencidos += 1;
      else if (a === "proximo") proximos += 1;
    }
    return { vencidos, proximos };
  }, [rows, hojeIso]);

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

  function selecionarContrato(contrato: Contrato) {
    setContratoSelecionadoId(contrato.id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("id", contrato.id);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <>
      <section className="form-card">
        <h2 className="form-card__title">Contratos ativos — renovação</h2>
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

        <p className="field__hint contratos-renovar__legenda">
          <span className="badge badge--danger">Vencido</span> fim previsto já passou ·{" "}
          <span className="badge badge--warn">Próximo</span> vence em até {PROXIMO_VENCER_DIAS} dias
          {resumo.vencidos + resumo.proximos > 0 ? (
            <>
              {" "}
              — {resumo.vencidos} vencido{resumo.vencidos === 1 ? "" : "s"}, {resumo.proximos} próximo
              {resumo.proximos === 1 ? "" : "s"}
            </>
          ) : null}
        </p>

        {query.isError ? (
          <QueryError
            message={
              query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar contratos."
            }
          />
        ) : null}

        <p className="field__hint">Selecione o contrato a renovar.</p>
        <DataTable
          loading={query.isLoading}
          rows={rows}
          keyFn={(c) => c.id}
          selectedKey={contratoSelecionadoId}
          onRowClick={selecionarContrato}
          rowClassName={(c) => rowClassVencimentoContrato(c, hojeIso)}
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
                  name="contrato-renovar"
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
            {
              key: "termino",
              header: "Fim previsto",
              render: (c) => {
                const fim = dataFimPrevistaContrato(c) ?? "—";
                const rotulo = rotuloAlertaVencimento(dataFimPrevistaContrato(c), hojeIso);
                const alerta = alertaVencimentoContrato(dataFimPrevistaContrato(c), hojeIso);
                return (
                  <span className="contratos-renovar__termino">
                    {fim}
                    {rotulo ? (
                      <span
                        className={
                          alerta === "vencido" ? "badge badge--danger" : "badge badge--warn"
                        }
                      >
                        {rotulo}
                      </span>
                    ) : null}
                  </span>
                );
              },
            },
          ]}
        />
      </section>

      {contratoSelecionado ? (
        <>
          <p className="field__hint">
            Selecionado:{" "}
            <strong>
              {clienteExibicaoPorId(
                clientesQuery.data?.items,
                contratoSelecionado.clienteId,
                contratoSelecionado.clienteNome,
              )}
            </strong>{" "}
            · {formatPlaca(contratoSelecionado.placa)} · fim{" "}
            {dataFimPrevistaContrato(contratoSelecionado) ?? "—"}
          </p>
          <ContratosCadastroSection
            modo="renovar"
            contratoId={contratoSelecionado.id}
            titulo="Renovar contrato"
            submitLabel="Gerar renovação"
            backTo="/contratos/renovar"
            backLabel="Voltar à lista de renovação"
          />
        </>
      ) : null}
    </>
  );
}
