import { useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/DataTable";
import { DocUploadField } from "@/components/DocUploadField";
import { Field, FormCard } from "@/components/FormCard";
import { PageHeader, QueryError } from "@/components/PageHeader";
import { PageTabs } from "@/components/PageTabs";
import { ResultPanel } from "@/components/ResultPanel";
import { useParceiros, useVeiculos, useVinculosParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { formatPlaca } from "@/lib/format";
import type { Parceiro } from "@/api/types";

type ParceiroLinha = Parceiro & {
  veiculos: number;
  placas: string[];
};

function ParceirosListSection() {
  const [busca, setBusca] = useState("");
  const parceirosQuery = useParceiros();
  const vinculosQuery = useVinculosParceiro();
  const veiculosQuery = useVeiculos();

  const loading =
    parceirosQuery.isLoading || vinculosQuery.isLoading || veiculosQuery.isLoading;

  const linhas = useMemo(() => {
    const placaPorVeiculoId = new Map(
      (veiculosQuery.data?.items ?? []).map((v) => [v.id, formatPlaca(v.placa)]),
    );
    const vinculosPorParceiro = new Map<string, string[]>();

    for (const v of vinculosQuery.data?.items ?? []) {
      const placas = vinculosPorParceiro.get(v.parceiroId) ?? [];
      const placa = placaPorVeiculoId.get(v.veiculoId) ?? v.veiculoId.slice(0, 8);
      placas.push(placa);
      vinculosPorParceiro.set(v.parceiroId, placas);
    }

    const termo = busca.trim().toLowerCase();

    return (parceirosQuery.data?.items ?? [])
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .map((p) => {
        const placas = vinculosPorParceiro.get(p.id) ?? [];
        return {
          ...p,
          veiculos: placas.length,
          placas: placas.sort((a, b) => a.localeCompare(b, "pt-BR")),
        } satisfies ParceiroLinha;
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [busca, parceirosQuery.data, vinculosQuery.data, veiculosQuery.data]);

  const erro =
    parceirosQuery.error ?? vinculosQuery.error ?? veiculosQuery.error ?? null;

  return (
    <>
      <div className="despesas-toolbar">
        <input
          className="input"
          placeholder="Filtrar por nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {erro ? (
        <QueryError
          message={
            erro instanceof LanzaApiError ? erro.message : "Falha ao listar parceiros."
          }
        />
      ) : null}

      <DataTable
        loading={loading}
        rows={linhas}
        keyFn={(p) => p.id}
        emptyMessage={
          busca.trim() ? "Nenhum parceiro corresponde ao filtro." : "Nenhum parceiro registado."
        }
        columns={[
          { key: "nome", header: "Nome", render: (p) => <strong>{p.nome}</strong> },
          {
            key: "veiculos",
            header: "Veículos",
            render: (p) => (
              <span className={p.veiculos > 0 ? "badge badge--ok" : "badge badge--muted"}>
                {p.veiculos}
              </span>
            ),
          },
          {
            key: "placas",
            header: "Placas vinculadas",
            render: (p) =>
              p.placas.length > 0 ? (
                <span className="parceiros-placas">{p.placas.join(" · ")}</span>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </>
  );
}

function ParceirosCadastroSection() {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [placa, setPlaca] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [cadastrarVeiculo, setCadastrarVeiculo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  function aplicarCrlv(campos: Record<string, unknown>) {
    if (typeof campos.proprietarioNome === "string" && campos.proprietarioNome.trim()) {
      setNome(campos.proprietarioNome.trim());
    }
    if (typeof campos.placa === "string") setPlaca(campos.placa);
    if (typeof campos.marcaModelo === "string") setMarcaModelo(campos.marcaModelo);
  }

  async function submit() {
    if (!nome.trim()) {
      setError("Informe o nome do parceiro.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const parceiro = await lanzaApi.criarParceiro(nome.trim());
      let veiculoResult: unknown = null;

      if (cadastrarVeiculo && placa.trim()) {
        veiculoResult = await lanzaApi.criarVeiculo({
          placa: placa.trim(),
          marcaModelo: marcaModelo.trim() || undefined,
          parceiroNome: nome.trim(),
          ativo: true,
          origem: "web-upload-crlv-parceiro",
        });
      }

      setResult({ parceiro, veiculo: veiculoResult });
      void qc.invalidateQueries({ queryKey: ["parceiros"] });
      void qc.invalidateQueries({ queryKey: ["veiculos"] });
      void qc.invalidateQueries({ queryKey: ["parceiros-vinculos"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao cadastrar parceiro.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FormCard
        title="Cadastrar parceiro"
        onSubmit={submit}
        loading={loading}
        submitLabel="Gravar parceiro"
        error={error}
      >
        <DocUploadField
          label="CRLV (PDF)"
          tipo="crlv"
          hint="O nome do proprietário no CRLV preenche o parceiro; placa e modelo opcionais para vincular veículo."
          disabled={loading}
          onParsed={({ campos }) => aplicarCrlv(campos)}
          onError={setError}
        />
        <Field label="Nome do parceiro (proprietário)">
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        <label className="field checkbox-label">
          <input
            type="checkbox"
            checked={cadastrarVeiculo}
            onChange={(e) => setCadastrarVeiculo(e.target.checked)}
          />
          Cadastrar veículo do CRLV e vincular ao parceiro
        </label>
        {cadastrarVeiculo ? (
          <>
            <Field label="Placa">
              <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} />
            </Field>
            <Field label="Marca / modelo">
              <input className="input" value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} />
            </Field>
          </>
        ) : null}
      </FormCard>
      <ResultPanel title="Resultado" data={result} />
    </>
  );
}

export function ParceirosPage() {
  return (
    <PageHeader
      title="Parceiros"
      description="Proprietários dos veículos — cadastro manual ou via CRLV."
    >
      <PageTabs
        ariaLabel="Parceiros"
        tabs={[
          { to: "/parceiros", label: "Listagem", end: true },
          { to: "/parceiros/cadastro", label: "Cadastro" },
        ]}
      />
      <Routes>
        <Route index element={<ParceirosListSection />} />
        <Route path="cadastro" element={<ParceirosCadastroSection />} />
        <Route path="*" element={<Navigate to="/parceiros" replace />} />
      </Routes>
    </PageHeader>
  );
}
