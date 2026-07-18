import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { DateInput } from "@/components/DateInput";
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

type FiltroSituacao = "em_aberto" | "pago" | "todos";

export function RelatorioCobrancasForm() {
  const meta = useQuery({ queryKey: ["cobrancas-meta"], queryFn: () => lanzaApi.metaCobrancas() });
  const [tipos, setTipos] = useState<string[]>(["pagamento-semanal"]);
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [situacao, setSituacao] = useState<FiltroSituacao>("em_aberto");
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [armazenarServidor, setArmazenarServidor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [textoVisivel, setTextoVisivel] = useState<string | undefined>();

  const opcoes = meta.data?.tipos ?? TIPOS_PADRAO.map((id) => ({ id, rotulo: id }));

  function toggleTipo(id: string) {
    setTipos((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  function onClienteChange(id: string) {
    setClienteId(id);
    if (id) setVeiculoPlaca("");
  }

  function onVeiculoChange(placa: string) {
    setVeiculoPlaca(placa);
    if (placa) setClienteId("");
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
          placa: veiculoPlaca.trim() || undefined,
          clienteId: clienteId || undefined,
          dataInicial: dataInicial.trim() || undefined,
          dataFinal: dataFinal.trim() || undefined,
          situacao: situacao === "em_aberto" ? undefined : situacao,
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
          <Field label="Data inicial">
            <DateInput value={dataInicial} onChange={setDataInicial} disabled={loading} />
          </Field>
          <Field label="Data final">
            <DateInput value={dataFinal} onChange={setDataFinal} disabled={loading} />
          </Field>
          <Field label="Situação">
            <select
              className="select"
              value={situacao}
              onChange={(e) => setSituacao(e.target.value as FiltroSituacao)}
              disabled={loading}
              aria-label="Situação"
            >
              <option value="em_aberto">Em aberto</option>
              <option value="pago">Pago</option>
              <option value="todos">Todas</option>
            </select>
          </Field>
          <Field label="Cliente" hint="Opcional — exclui filtro por veículo">
            <ClienteSelect
              value={clienteId}
              onChange={onClienteChange}
              emptyLabel="Todos os clientes"
              disabled={loading || Boolean(veiculoPlaca)}
            />
          </Field>
          <Field label="Veículo" hint="Opcional — exclui filtro por cliente">
            <VeiculoSelect
              value={veiculoPlaca}
              onChange={onVeiculoChange}
              emptyLabel="Todos os veículos"
              disabled={loading || Boolean(clienteId)}
            />
          </Field>
          <Field label="Tipos de cobrança" span="full">
            <div className="checkbox-group">
              {opcoes.map((t) => (
                <label key={t.id} className="checkbox-label">
                  <input type="checkbox" checked={tipos.includes(t.id)} onChange={() => toggleTipo(t.id)} />
                  {t.rotulo}
                </label>
              ))}
            </div>
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
