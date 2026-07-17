import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

const TIPOS_PADRAO = [
  "pagamento-semanal",
  "renegociacao",
  "infracoes",
  "pedagio",
  "estacionamento-rotativo",
  "manutencao",
];

export function RelatorioCobrancasForm() {
  const meta = useQuery({ queryKey: ["cobrancas-meta"], queryFn: () => lanzaApi.metaCobrancas() });
  const [tipos, setTipos] = useState<string[]>(["pagamento-semanal"]);
  const [placa, setPlaca] = useState("");
  const [cliente, setCliente] = useState("");
  const [salvar, setSalvar] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const opcoes = meta.data?.tipos ?? TIPOS_PADRAO.map((id) => ({ id, rotulo: id }));

  function toggleTipo(id: string) {
    setTipos((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function gerar() {
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.gerarCobrancas({
        tipos: tipos.length ? tipos : undefined,
        salvar,
        filtro: {
          placa: placa.trim() || undefined,
          cliente: cliente.trim() || undefined,
        },
      });
      setResult(r.data);
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gerar cobranças.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FormCard title="Parâmetros" onSubmit={gerar} loading={loading} submitLabel="Gerar cobranças" error={error}>
        <Field label="Tipos de cobrança">
          <div className="checkbox-group">
            {opcoes.map((t) => (
              <label key={t.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={tipos.includes(t.id)}
                  onChange={() => toggleTipo(t.id)}
                />
                {t.rotulo}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Placa (opcional)">
          <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} />
        </Field>
        <Field label="Cliente (opcional)" hint="Nome parcial ou CPF">
          <input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} />
        </Field>
        <Field label="Gravar ficheiros">
          <label className="checkbox-label">
            <input type="checkbox" checked={salvar} onChange={(e) => setSalvar(e.target.checked)} />
            Salvar sidecars e mensagens
          </label>
        </Field>
      </FormCard>
      <ResultPanel title="Resultado da geração" data={result} />
    </>
  );
}
