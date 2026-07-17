import { useState } from "react";
import { CadastroBackLink } from "@/components/CadastroBackLink";
import { DateInput } from "@/components/DateInput";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

export function ContratosEncerrarSection() {
  const [idOuPasta, setIdOuPasta] = useState("");
  const [dataEncerramento, setDataEncerramento] = useState("");
  const [motivo, setMotivo] = useState("devolvido");
  const [quebraContrato, setQuebraContrato] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.encerrarContrato({
        idOuPasta: idOuPasta.trim(),
        dataEncerramento: dataEncerramento.trim(),
        motivoEncerramento: motivo,
        quebraContrato,
      });
      setResult(r.data);
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao encerrar contrato.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CadastroBackLink to="/contratos" />
      <FormCard title="Efetivar encerramento" onSubmit={submit} loading={loading} submitLabel="Encerrar contrato" error={error}>
        <Field label="ID ou pasta do contrato">
          <input className="input" value={idOuPasta} onChange={(e) => setIdOuPasta(e.target.value)} required />
        </Field>
        <Field label="Data encerramento">
          <DateInput value={dataEncerramento} onChange={setDataEncerramento} required disabled={loading} />
        </Field>
        <Field label="Motivo">
          <select className="select" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            <option value="devolvido">Devolvido</option>
            <option value="quebra">Quebra</option>
            <option value="outro">Outro</option>
          </select>
        </Field>
        <label className="field checkbox-label">
          <input type="checkbox" checked={quebraContrato} onChange={(e) => setQuebraContrato(e.target.checked)} />
          Quebra de contrato
        </label>
      </FormCard>
      <ResultPanel title="Encerramento efetivado" data={result} />
    </>
  );
}
