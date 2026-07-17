import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { Field, FormCard } from "@/components/FormCard";
import { DocUploadField } from "@/components/DocUploadField";
import { ResultPanel } from "@/components/ResultPanel";
import { useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { VeiculosToolsSection } from "@/pages/VeiculosToolsSection";
import { formatPlaca, statusClass, statusLabel } from "@/lib/format";

function VeiculosListSection() {
  const [filtro, setFiltro] = useState<"ativos" | "todos">("ativos");
  const [placa, setPlaca] = useState("");
  const query = useVeiculos({
    ativo: filtro === "ativos" ? true : undefined,
    placa: placa.trim() || undefined,
  });

  return (
    <>
      <div className="despesas-toolbar">
        <input
          className="input"
          placeholder="Filtrar placa"
          value={placa}
          onChange={(e) => setPlaca(e.target.value)}
        />
        <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
          <option value="ativos">Só ativos</option>
          <option value="todos">Todos</option>
        </select>
      </div>
      {query.isError ? (
        <QueryError
          message={
            query.error instanceof LanzaApiError ? query.error.message : "Falha ao listar veículos."
          }
        />
      ) : null}
      <DataTable
        loading={query.isLoading}
        rows={query.data?.items ?? []}
        keyFn={(v) => v.id}
        columns={[
          { key: "placa", header: "Placa", render: (v) => <strong>{formatPlaca(v.placa)}</strong> },
          { key: "modelo", header: "Marca / modelo", render: (v) => v.marcaModelo ?? "—" },
          { key: "uf", header: "UF", render: (v) => v.ufRegistro ?? "SC" },
          {
            key: "ativo",
            header: "Status",
            render: (v) => (
              <span className={statusClass(v.ativo)}>{statusLabel(v.ativo)}</span>
            ),
          },
        ]}
      />
    </>
  );
}

function VeiculosCadastroSection() {
  const qc = useQueryClient();
  const [placa, setPlaca] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [anoModelo, setAnoModelo] = useState("");
  const [chassi, setChassi] = useState("");
  const [renavam, setRenavam] = useState("");
  const [cor, setCor] = useState("");
  const [ufRegistro, setUfRegistro] = useState("SC");
  const [parceiroNome, setParceiroNome] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  function aplicarCrlv(campos: Record<string, unknown>) {
    if (typeof campos.placa === "string") setPlaca(campos.placa);
    if (typeof campos.marcaModelo === "string") setMarcaModelo(campos.marcaModelo);
    if (typeof campos.anoModelo === "string") setAnoModelo(campos.anoModelo);
    if (typeof campos.chassi === "string") setChassi(campos.chassi);
    if (typeof campos.renavam === "string") setRenavam(campos.renavam);
    if (typeof campos.cor === "string") setCor(campos.cor);
    if (typeof campos.ufRegistro === "string") setUfRegistro(campos.ufRegistro);
    if (typeof campos.proprietarioNome === "string" && campos.proprietarioNome.trim()) {
      setParceiroNome(campos.proprietarioNome.trim());
    }
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.criarVeiculo({
        placa: placa.trim(),
        marcaModelo: marcaModelo.trim() || undefined,
        anoModelo: anoModelo.trim() || undefined,
        chassi: chassi.trim() || undefined,
        renavam: renavam.trim() || undefined,
        cor: cor.trim() || undefined,
        ufRegistro: ufRegistro.trim() || undefined,
        parceiroNome: parceiroNome.trim() || undefined,
        ativo,
        origem: "web-upload-crlv",
      });
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
      void qc.invalidateQueries({ queryKey: ["parceiros"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao cadastrar veículo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FormCard title="Cadastrar veículo" onSubmit={submit} loading={loading} submitLabel="Gravar" error={error}>
        <DocUploadField
          label="CRLV (PDF)"
          tipo="crlv"
          hint="Envie o PDF do CRLV para preencher placa, modelo, chassi e proprietário."
          disabled={loading}
          onParsed={({ campos }) => aplicarCrlv(campos)}
          onError={setError}
        />
        <Field label="Placa">
          <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} required />
        </Field>
        <Field label="Marca / modelo">
          <input className="input" value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} />
        </Field>
        <Field label="Ano / modelo">
          <input className="input" value={anoModelo} onChange={(e) => setAnoModelo(e.target.value)} placeholder="2012/2013" />
        </Field>
        <Field label="Chassi">
          <input className="input" value={chassi} onChange={(e) => setChassi(e.target.value)} />
        </Field>
        <Field label="RENAVAM">
          <input className="input" value={renavam} onChange={(e) => setRenavam(e.target.value)} />
        </Field>
        <Field label="Cor">
          <input className="input" value={cor} onChange={(e) => setCor(e.target.value)} />
        </Field>
        <Field label="UF registro">
          <input className="input" value={ufRegistro} onChange={(e) => setUfRegistro(e.target.value)} />
        </Field>
        <Field label="Parceiro (proprietário)">
          <input className="input" value={parceiroNome} onChange={(e) => setParceiroNome(e.target.value)} />
        </Field>
        <Field label="Ativo">
          <label className="checkbox-label">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Veículo ativo na frota
          </label>
        </Field>
      </FormCard>
      <ResultPanel title="Veículo gravado" data={result} />
    </>
  );
}

export function VeiculosPage() {
  return (
    <PageHeader
      title="Veículos"
      description="Frota de locação — listagem, cadastro e ferramentas FIPE/CRLV."
    >
      <PageTabs
        ariaLabel="Veículos"
        tabs={[
          { to: "/veiculos", label: "Listagem", end: true },
          { to: "/veiculos/cadastro", label: "Cadastro" },
          { to: "/veiculos/fipe", label: "FIPE / CRLV" },
        ]}
      />
      <Routes>
        <Route index element={<VeiculosListSection />} />
        <Route path="cadastro" element={<VeiculosCadastroSection />} />
        <Route path="fipe" element={<VeiculosToolsSection />} />
        <Route path="*" element={<Navigate to="/veiculos" replace />} />
      </Routes>
    </PageHeader>
  );
}
