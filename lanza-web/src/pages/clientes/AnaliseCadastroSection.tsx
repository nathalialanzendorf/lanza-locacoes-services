import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { Field, FormCard } from "@/components/FormCard";
import { DateInput } from "@/components/DateInput";
import { ResultPanel } from "@/components/ResultPanel";
import { RowDecisaoActions } from "@/components/RowDecisaoActions";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import type { AnaliseCadastroItem } from "@/api/types";

export function AnaliseCadastroSection() {
  const qc = useQueryClient();
  const listQuery = useQuery({
    queryKey: ["analise-cadastro"],
    queryFn: () => lanzaApi.listarAnalisesCadastro(),
  });

  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [baseLegal, setBaseLegal] = useState("consentimento do locatário");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function executar() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.executarAnaliseCadastro({
        cpf: cpf.trim(),
        nome: nome.trim(),
        nascimento: nascimento.trim(),
        baseLegal: baseLegal.trim(),
      });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["analise-cadastro"] });
      void qc.invalidateQueries({ queryKey: ["clientes"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha na análise.");
    } finally {
      setLoading(false);
    }
  }

  async function decidir(item: AnaliseCadastroItem, aprovado: boolean) {
    try {
      await lanzaApi.decisaoAnaliseCadastro(item.id, aprovado);
      void qc.invalidateQueries({ queryKey: ["analise-cadastro"] });
      void qc.invalidateQueries({ queryKey: ["clientes"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao registrar decisão.");
    }
  }

  return (
    <>
      <FormCard
        title="Nova análise de cadastro"
        onSubmit={executar}
        loading={loading}
        submitLabel="Executar triagem (background)"
        error={error}
      >
        <Field label="CPF">
          <input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} required />
        </Field>
        <Field label="Nome completo">
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        <Field label="Nascimento">
          <DateInput value={nascimento} onChange={setNascimento} required disabled={loading} />
        </Field>
        <Field label="Base legal (LGPD)">
          <input className="input" value={baseLegal} onChange={(e) => setBaseLegal(e.target.value)} required />
        </Field>
        <p className="field__hint">
          Consulta BNMP, PF SINIC e TJSC via Chrome no servidor — requer operador no ambiente da API.
        </p>
      </FormCard>

      <ResultPanel title="Job / resultado" data={result} />

      <h2 className="form-card__title">Histórico</h2>
      <DataTable
        loading={listQuery.isLoading}
        rows={listQuery.data?.items ?? []}
        keyFn={(a) => a.id}
        columns={[
          { key: "nome", header: "Nome", render: (a) => a.nome ?? "—" },
          { key: "cpf", header: "CPF", render: (a) => a.cpf ?? "—" },
          { key: "data", header: "Data", render: (a) => a.dataConsulta ?? "—" },
          {
            key: "alerta",
            header: "Alerta",
            render: (a) =>
              a.alertaGeral ? (
                <span className="badge badge--warn">Sim</span>
              ) : (
                <span className="badge badge--ok">Não</span>
              ),
          },
          {
            key: "decisao",
            header: "Decisão",
            render: (a) => {
              if (a.aprovado === true) return <span className="badge badge--ok">Aprovado</span>;
              if (a.aprovado === false) return <span className="badge badge--danger">Reprovado</span>;
              return <RowDecisaoActions onApprove={() => void decidir(a, true)} onReject={() => void decidir(a, false)} />;
            },
          },
        ]}
      />
    </>
  );
}
