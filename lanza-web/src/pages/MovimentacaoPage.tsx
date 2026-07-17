import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useLocacoes } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";

function MovimentacaoListSection() {
  const qc = useQueryClient();
  const [emAberto, setEmAberto] = useState(true);
  const [placa, setPlaca] = useState("");
  const [removendo, setRemovendo] = useState<string | null>(null);
  const query = useLocacoes({
    abertas: emAberto ? true : undefined,
    placa: placa.trim() || undefined,
  });

  async function remover(id: string) {
    if (!window.confirm("Remover esta movimentação?")) return;
    setRemovendo(id);
    try {
      await lanzaApi.removerLocacao(id);
      void qc.invalidateQueries({ queryKey: ["locacoes"] });
    } finally {
      setRemovendo(null);
    }
  }

  return (
    <>
      <div className="despesas-toolbar">
        <input
          className="input"
          placeholder="Filtrar placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
        <label className="checkbox-label">
          <input type="checkbox" checked={emAberto} onChange={(e) => setEmAberto(e.target.checked)} />
          Só períodos abertos
        </label>
      </div>
      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar movimentações."
          }
        />
      ) : null}
      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(l) => l.id}
        columns={[
          { key: "situacao", header: "Situação", render: (l) => l.situacao ?? l.tipo ?? "—" },
          { key: "placa", header: "Placa", render: (l) => formatPlaca(l.placa) },
          { key: "inicio", header: "Início", render: (l) => l.inicio ?? "—" },
          { key: "fim", header: "Fim", render: (l) => l.fim ?? "Em aberto" },
          { key: "condutor", header: "Condutor", render: (l) => l.condutor ?? l.clienteId ?? "—" },
          {
            key: "acoes",
            header: "",
            render: (l) => (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={removendo === l.id}
                onClick={() => void remover(l.id)}
              >
                Remover
              </button>
            ),
          },
        ]}
      />
    </>
  );
}

function MovimentacaoCadastroSection() {
  const qc = useQueryClient();
  const [placa, setPlaca] = useState("");
  const [situacao, setSituacao] = useState("locado");
  const [tipoLocacao, setTipoLocacao] = useState("semanal");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [condutor, setCondutor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.salvarLocacao({
        placa: placa.trim(),
        situacao,
        inicio: inicio.trim(),
        fim: fim.trim() || null,
        condutor: condutor.trim() || null,
        tipoLocacao: situacao === "locado" ? tipoLocacao : null,
        observacao: observacao.trim() || null,
      });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["locacoes"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar movimentação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FormCard title="Nova movimentação" onSubmit={submit} loading={loading} submitLabel="Gravar" error={error}>
        <Field label="Placa">
          <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} required />
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
        <Field label="Condutor (nome ou id)">
          <input className="input" value={condutor} onChange={(e) => setCondutor(e.target.value)} />
        </Field>
        <Field label="Observação">
          <input className="input" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Field>
      </FormCard>
      <ResultPanel title="Movimentação gravada" data={result} />
    </>
  );
}

export function MovimentacaoPage() {
  return (
    <PageHeader
      title="Movimentação"
      description="Locado, reserva, manutenção e trocas — registos em locacoes.json."
    >
      <PageTabs
        ariaLabel="Movimentação"
        tabs={[
          { to: "/movimentacao", label: "Listagem", end: true },
          { to: "/movimentacao/cadastro", label: "Cadastro" },
        ]}
      />
      <Routes>
        <Route index element={<MovimentacaoListSection />} />
        <Route path="cadastro" element={<MovimentacaoCadastroSection />} />
        <Route path="*" element={<Navigate to="/movimentacao" replace />} />
      </Routes>
    </PageHeader>
  );
}
