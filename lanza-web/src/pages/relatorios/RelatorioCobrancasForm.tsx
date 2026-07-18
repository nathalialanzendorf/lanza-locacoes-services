import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { DateInput } from "@/components/DateInput";
import { Field } from "@/components/FormCard";
import { CobrancasVisualizacao } from "@/components/relatorios/CobrancasVisualizacao";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { LABEL } from "@/lib/labels";
import {
  downloadArquivoTexto,
  downloadPdfViaImpressao,
  extrairBlocosCobrancas,
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
  const [tipo, setTipo] = useState("");
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [situacao, setSituacao] = useState<FiltroSituacao>("em_aberto");
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [armazenarServidor, setArmazenarServidor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const opcoes = meta.data?.tipos ?? TIPOS_PADRAO.map((id) => ({ id, rotulo: id }));
  const rotulosTipo = Object.fromEntries(opcoes.map((t) => [t.id, t.rotulo]));

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
    }
    try {
      const r = await lanzaApi.gerarCobrancas({
        tipos: tipo ? [tipo] : undefined,
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
      const totalMensagens = extrairBlocosCobrancas(payload, rotulosTipo).reduce(
        (n, b) => n + b.mensagens.length,
        0,
      );
      if (totalMensagens === 0) {
        throw new Error("Nenhuma mensagem gerada para os filtros selecionados.");
      }
      const texto = textoCobrancas(payload, rotulosTipo);
      const nome = `cobrancas-${new Date().toISOString().slice(0, 10)}`;
      if (modo === "visualizar") {
        setResult(payload);
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
        <div className="form-grid">
          <Field label="Veículo" hint="Opcional — exclui filtro por cliente">
            <VeiculoSelect
              value={veiculoPlaca}
              onChange={onVeiculoChange}
              ativo
              emptyLabel="Todos os veículos ativos"
              disabled={loading || Boolean(clienteId)}
            />
          </Field>
          <Field label="Cliente" hint="Opcional — exclui filtro por veículo">
            <ClienteSelect
              value={clienteId}
              onChange={onClienteChange}
              ativo
              emptyLabel="Todos os clientes ativos"
              disabled={loading || Boolean(veiculoPlaca)}
            />
          </Field>
          <Field label="Tipo de cobrança">
            <select
              className="select"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              disabled={loading || meta.isLoading}
              aria-label="Tipo de cobrança"
            >
              <option value="">{meta.isLoading ? "A carregar…" : "Todos os tipos"}</option>
              {opcoes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </Field>
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
        </div>
        <label className="field checkbox-label relatorio-entrega__check">
          <input
            type="checkbox"
            checked={armazenarServidor}
            onChange={(e) => setArmazenarServidor(e.target.checked)}
            disabled={loading}
          />
          Armazenar no servidor
        </label>
        <p className="field__hint">
          Se marcado, grava ficheiros e espelha no armazenamento configurado (ex.: Vercel Blob).
        </p>
        <div className="relatorio-entrega__acoes">
          <button
            type="button"
            className="btn btn--primary"
            disabled={loading}
            onClick={() => void entregar("visualizar")}
          >
            {loading ? LABEL.processando : "Visualizar"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={loading}
            onClick={() => void entregar("txt")}
          >
            Download TXT
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={loading}
            onClick={() => void entregar("pdf")}
          >
            Download PDF
          </button>
        </div>
        {error ? <p className="form-card__error">{error}</p> : null}
      </section>

      <CobrancasVisualizacao data={result} rotulos={rotulosTipo} />
    </>
  );
}
