import { useState } from "react";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

export function RelatorioEncerramentoForm() {
  const [pastaContrato, setPastaContrato] = useState("");
  const [dataEncerramento, setDataEncerramento] = useState("");
  const [semanasPagas, setSemanasPagas] = useState("");
  const [salvar, setSalvar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    data?: unknown;
    whatsapp?: string;
    texto?: string;
    avisos?: string[];
    arquivos?: unknown;
  } | null>(null);

  const [idOuPasta, setIdOuPasta] = useState("");
  const [motivo, setMotivo] = useState("devolvido");
  const [quebraContrato, setQuebraContrato] = useState(false);
  const [loadingEncerrar, setLoadingEncerrar] = useState(false);
  const [encerrarResult, setEncerrarResult] = useState<unknown>(null);
  const [encerrarError, setEncerrarError] = useState<string | null>(null);

  async function calcular() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.gerarEncerramento({
        pastaContrato: pastaContrato.trim(),
        dataEncerramento: dataEncerramento.trim(),
        semanasPagas: semanasPagas.trim() ? Number(semanasPagas) : undefined,
        salvar,
      });
      setResult(r);
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao calcular encerramento.");
    } finally {
      setLoading(false);
    }
  }

  async function efetivarEncerramento() {
    setLoadingEncerrar(true);
    setEncerrarError(null);
    try {
      const r = await lanzaApi.encerrarContrato({
        idOuPasta: idOuPasta.trim() || pastaContrato.trim(),
        dataEncerramento: dataEncerramento.trim(),
        motivoEncerramento: motivo,
        quebraContrato,
      });
      setEncerrarResult(r.data);
    } catch (err) {
      setEncerrarError(err instanceof LanzaApiError ? err.message : "Falha ao encerrar contrato.");
    } finally {
      setLoadingEncerrar(false);
    }
  }

  return (
    <>
      <FormCard
        title="Calcular acerto final"
        onSubmit={calcular}
        loading={loading}
        submitLabel="Calcular relatório"
        error={error}
      >
        <Field label="Pasta do contrato" hint="Ex.: 17.07.2026 - Nome Cliente">
          <input
            className="input"
            value={pastaContrato}
            onChange={(e) => setPastaContrato(e.target.value)}
            required
          />
        </Field>
        <Field label="Data de encerramento" hint="DD/MM/AAAA">
          <input
            className="input"
            value={dataEncerramento}
            onChange={(e) => setDataEncerramento(e.target.value)}
            required
          />
        </Field>
        <Field label="Semanas pagas (opcional)">
          <input
            className="input"
            type="number"
            min={0}
            value={semanasPagas}
            onChange={(e) => setSemanasPagas(e.target.value)}
          />
        </Field>
        <Field label="Gravar ficheiros">
          <label className="checkbox-label">
            <input type="checkbox" checked={salvar} onChange={(e) => setSalvar(e.target.checked)} />
            Salvar TXT/JSON em relatorios/
          </label>
        </Field>
      </FormCard>

      <ResultPanel
        title="Resultado do cálculo"
        whatsapp={result?.whatsapp}
        texto={result?.texto}
        data={result?.data}
        arquivos={result?.arquivos}
      />

      <FormCard
        title="Efetivar encerramento"
        onSubmit={efetivarEncerramento}
        loading={loadingEncerrar}
        submitLabel="Encerrar contrato no database"
        error={encerrarError}
      >
        <Field label="ID ou pasta" hint="Deixe vazio para usar a pasta acima">
          <input className="input" value={idOuPasta} onChange={(e) => setIdOuPasta(e.target.value)} />
        </Field>
        <Field label="Motivo">
          <select className="select" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="devolvido">Devolvido</option>
            <option value="recuperado">Recuperado</option>
            <option value="troca">Troca</option>
          </select>
        </Field>
        <Field label="Quebra de contrato">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={quebraContrato}
              onChange={(e) => setQuebraContrato(e.target.checked)}
            />
            Registrar quebra (multa contratual)
          </label>
        </Field>
      </FormCard>

      <ResultPanel title="Contrato encerrado" data={encerrarResult} />
    </>
  );
}
