import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { DocUploadField } from "@/components/DocUploadField";
import { DateInput } from "@/components/DateInput";
import { Field, FormCard, FormSection } from "@/components/FormCard";
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
  const [documentosLidos, setDocumentosLidos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  function marcarDocumentoLido() {
    setDocumentosLidos(true);
    setError(null);
  }

  function aplicarCnh(campos: Record<string, unknown>) {
    marcarDocumentoLido();
    if (typeof campos.nome === "string" && campos.nome.trim()) setNome(campos.nome.trim());
    if (typeof campos.cpf === "string" && campos.cpf.trim()) setCpf(campos.cpf.trim());
    const nasc =
      typeof campos.dataNascimento === "string"
        ? campos.dataNascimento
        : typeof campos.nascimento === "string"
          ? campos.nascimento
          : "";
    if (nasc.trim()) setNascimento(nasc.trim());
  }

  function aplicarComprovante(campos: Record<string, unknown>) {
    marcarDocumentoLido();
    if (typeof campos.titular === "string" && campos.titular.trim() && !nome.trim()) {
      setNome(campos.titular.trim());
    }
  }

  async function executar() {
    if (!cpf.trim() || !nome.trim() || !nascimento.trim()) {
      setError("Envie os documentos ou preencha CPF, nome e nascimento antes de executar.");
      return;
    }
    if (!baseLegal.trim()) {
      setError("Informe a base legal (LGPD).");
      return;
    }
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
        <FormSection
          title="Importar"
          hint="Envie a CNH e o comprovante de residência. Os campos abaixo são preenchidos automaticamente e podem ser editados."
        >
          <div className="doc-upload-row">
            <DocUploadField
              label="CNH (PDF)"
              tipo="cnh"
              disabled={loading}
              onParsed={({ campos }) => aplicarCnh(campos)}
              onError={setError}
            />
            <DocUploadField
              label="Comprovante de residência"
              tipo="comprovante-residencia"
              hint="Confira se o titular é o locatário."
              disabled={loading}
              onParsed={({ campos }) => aplicarComprovante(campos)}
              onError={setError}
            />
          </div>
        </FormSection>

        <FormSection
          title="Identificação"
          hint={documentosLidos ? "Dados extraídos dos documentos — confira antes de executar." : undefined}
        >
          <div className="form-grid">
            <Field label="Nome completo" span="wide">
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} disabled={loading} />
            </Field>
            <Field label="CPF">
              <input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} disabled={loading} />
            </Field>
            <Field label="Nascimento">
              <DateInput value={nascimento} onChange={setNascimento} disabled={loading} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Base legal (LGPD)">
          <div className="form-grid">
            <Field label="Fundamentação" span="full">
              <input
                className="input"
                value={baseLegal}
                onChange={(e) => setBaseLegal(e.target.value)}
                disabled={loading}
              />
            </Field>
          </div>
          <p className="field__hint">
            Consulta BNMP, PF SINIC e TJSC via Chrome no servidor — requer operador no ambiente da API.
          </p>
        </FormSection>
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
