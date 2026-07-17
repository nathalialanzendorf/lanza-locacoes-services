import { useState } from "react";
import { Field, FormCard } from "@/components/FormCard";
import { RelatorioEntrega } from "@/components/relatorios/RelatorioEntrega";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import {
  downloadArquivoTexto,
  downloadPdfViaImpressao,
  textoEncerramento,
  type RelatorioModoEntrega,
} from "@/lib/relatorioDownload";

type EncerramentoPayload = {
  data?: unknown;
  whatsapp?: string;
  texto?: string;
  avisos?: string[];
  arquivos?: unknown;
};

function normalizarEncerramento(r: EncerramentoPayload & { data?: EncerramentoPayload }): EncerramentoPayload {
  if (r.texto != null || r.whatsapp != null) return r;
  if (r.data && typeof r.data === "object" && ("texto" in r.data || "whatsapp" in r.data)) {
    return r.data as EncerramentoPayload;
  }
  return r;
}

export function RelatorioEncerramentoForm() {
  const [pastaContrato, setPastaContrato] = useState("");
  const [dataEncerramento, setDataEncerramento] = useState("");
  const [semanasPagas, setSemanasPagas] = useState("");
  const [armazenarServidor, setArmazenarServidor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EncerramentoPayload | null>(null);

  const [idOuPasta, setIdOuPasta] = useState("");
  const [motivo, setMotivo] = useState("devolvido");
  const [quebraContrato, setQuebraContrato] = useState(false);
  const [loadingEncerrar, setLoadingEncerrar] = useState(false);
  const [encerrarResult, setEncerrarResult] = useState<unknown>(null);
  const [encerrarError, setEncerrarError] = useState<string | null>(null);

  const paramsValidos = Boolean(pastaContrato.trim() && dataEncerramento.trim());

  async function entregar(modo: RelatorioModoEntrega) {
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
      <section className="form-card">
        <h2 className="form-card__title">Calcular acerto final</h2>
        <div className="form-grid">
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
        </div>
        {error ? <p className="form-card__error">{error}</p> : null}
      </section>

      <RelatorioEntrega
        loading={loading}
        disabled={!paramsValidos}
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
