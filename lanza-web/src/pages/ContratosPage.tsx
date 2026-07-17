import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { DataTable } from "@/components/DataTable";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useContratos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";
import { ContratosEncerrarSection } from "@/pages/ContratosEncerrarSection";

function ContratosListSection() {
  const [status, setStatus] = useState<"ativo" | "encerrado" | "">("ativo");
  const query = useContratos({ status: status || undefined });

  return (
    <>
      <div className="despesas-toolbar">
        <select
          className="select"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
        >
          <option value="ativo">Ativos</option>
          <option value="encerrado">Encerrados</option>
          <option value="">Todos</option>
        </select>
      </div>
      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError
              ? query.error.message
              : "Falha ao listar contratos."
          }
        />
      ) : null}
      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(c) => c.id}
        columns={[
          { key: "pasta", header: "Pasta", render: (c) => c.pasta ?? c.id },
          { key: "placa", header: "Placa", render: (c) => formatPlaca(c.placa) },
          {
            key: "status",
            header: "Status",
            render: (c) => (
              <span className={c.status === "ativo" ? "badge badge--ok" : "badge badge--muted"}>
                {c.status ?? "—"}
              </span>
            ),
          },
          { key: "inicio", header: "Início", render: (c) => c.dataInicio ?? "—" },
          { key: "fim", header: "Fim", render: (c) => c.dataFim ?? "—" },
        ]}
      />
    </>
  );
}

function ContratosCadastroSection() {
  const [modo, setModo] = useState<"criar" | "renovar">("criar");
  const [placa, setPlaca] = useState("");
  const [cpf, setCpf] = useState("");
  const [semana, setSemana] = useState("");
  const [caucao, setCaucao] = useState("");
  const [periodo, setPeriodo] = useState("semana");
  const [semanaEntrada, setSemanaEntrada] = useState("");
  const [semanaParcelasN, setSemanaParcelasN] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        placa: placa.trim(),
        cpf: cpf.trim() || undefined,
        semana: Number(semana),
        caucao: Number(caucao),
        periodo: periodo.trim() || undefined,
        semanaEntrada: semanaEntrada.trim() ? Number(semanaEntrada) : undefined,
        semanaParcelasN: semanaParcelasN.trim() ? Number(semanaParcelasN) : undefined,
      };
      const fn = modo === "criar" ? lanzaApi.criarContrato : lanzaApi.renovarContrato;
      const r = await fn(body);
      setResult(r);
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gerar contrato.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FormCard
        title={modo === "criar" ? "Novo contrato" : "Renovar contrato"}
        onSubmit={submit}
        loading={loading}
        submitLabel="Gerar Word/PDF"
        error={error}
      >
        <Field label="Modo">
          <select className="select" value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}>
            <option value="criar">Criar</option>
            <option value="renovar">Renovar</option>
          </select>
        </Field>
        <Field label="Placa">
          <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} required />
        </Field>
        <Field label="CPF do cliente">
          <input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        </Field>
        <Field label="Valor semanal (R$)">
          <input className="input" type="number" step="0.01" value={semana} onChange={(e) => setSemana(e.target.value)} required />
        </Field>
        <Field label="Caução (R$)">
          <input className="input" type="number" step="0.01" value={caucao} onChange={(e) => setCaucao(e.target.value)} required />
        </Field>
        <Field label="Período">
          <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="semana">1 semana</option>
            <option value="15 dias">15 dias</option>
            <option value="3 meses">3 meses</option>
            <option value="6 meses">6 meses</option>
            <option value="1 ano">1 ano</option>
          </select>
        </Field>
        <Field label="1ª semana entrada (R$)" hint="Cláusula 3.2 — parcelado">
          <input className="input" type="number" step="0.01" value={semanaEntrada} onChange={(e) => setSemanaEntrada(e.target.value)} />
        </Field>
        <Field label="Semanas restantes parcelamento">
          <input className="input" type="number" min={0} value={semanaParcelasN} onChange={(e) => setSemanaParcelasN(e.target.value)} />
        </Field>
      </FormCard>
      <ResultPanel title="Contrato gerado" data={result} />
    </>
  );
}

export function ContratosPage() {
  return (
    <PageHeader
      title="Contratos"
      description="Listagem e geração de contratos de locação (Word/PDF + contratos.json)."
    >
      <PageTabs
        ariaLabel="Contratos"
        tabs={[
          { to: "/contratos", label: "Listagem", end: true },
          { to: "/contratos/cadastro", label: "Cadastro" },
          { to: "/contratos/encerrar", label: "Encerrar" },
        ]}
      />
      <Routes>
        <Route index element={<ContratosListSection />} />
        <Route path="cadastro" element={<ContratosCadastroSection />} />
        <Route path="encerrar" element={<ContratosEncerrarSection />} />
        <Route path="*" element={<Navigate to="/contratos" replace />} />
      </Routes>
    </PageHeader>
  );
}
