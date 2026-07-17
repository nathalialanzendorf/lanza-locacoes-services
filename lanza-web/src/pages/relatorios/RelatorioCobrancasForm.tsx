import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Field } from "@/components/FormCard";
import { RelatorioEntrega } from "@/components/relatorios/RelatorioEntrega";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import {
  downloadArquivoTexto,
  downloadPdfViaImpressao,
  textoCobrancas,
  type RelatorioModoEntrega,
} from "@/lib/relatorioDownload";

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
  const [armazenarServidor, setArmazenarServidor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [textoVisivel, setTextoVisivel] = useState<string | undefined>();

  const opcoes = meta.data?.tipos ?? TIPOS_PADRAO.map((id) => ({ id, rotulo: id }));

  function toggleTipo(id: string) {
    setTipos((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function entregar(modo: RelatorioModoEntrega) {
    setLoading(true);
    setError(null);
    if (modo !== "visualizar") {
      setResult(null);
      setTextoVisivel(undefined);
    }
    try {
      const r = await lanzaApi.gerarCobrancas({
        tipos: tipos.length ? tipos : undefined,
        armazenarServidor,
        filtro: {
          placa: placa.trim() || undefined,
          cliente: cliente.trim() || undefined,
        },
      });
      const payload = r.data;
      const texto = textoCobrancas(payload);
      if (!texto.trim()) {
        throw new Error("Nenhuma mensagem gerada para os filtros selecionados.");
      }
      const nome = `cobrancas-${new Date().toISOString().slice(0, 10)}`;
      if (modo === "visualizar") {
        setResult(payload);
        setTextoVisivel(texto);
      } else if (modo === "txt") {
        downloadArquivoTexto(nome, texto);
      } else {
        downloadPdfViaImpressao(nome, texto);
      }
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : err instanceof Error ? err.message : "Falha ao gerar cobranças.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="form-card">
        <h2 className="form-card__title">Parâmetros</h2>
        <div className="form-grid">
          <Field label="Tipos de cobrança">
            <div className="checkbox-group">
              {opcoes.map((t) => (
                <label key={t.id} className="checkbox-label">
                  <input type="checkbox" checked={tipos.includes(t.id)} onChange={() => toggleTipo(t.id)} />
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
        </div>
        {error ? <p className="form-card__error">{error}</p> : null}
      </section>

      <RelatorioEntrega
        loading={loading}
        armazenarServidor={armazenarServidor}
        onArmazenarServidorChange={setArmazenarServidor}
        onEntrega={(modo) => void entregar(modo)}
      />

      <ResultPanel title="Visualização" texto={textoVisivel} data={result} />
    </>
  );
}
