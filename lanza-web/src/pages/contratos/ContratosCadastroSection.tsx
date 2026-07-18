import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

type ModoContrato = "criar" | "renovar";

type Props = {
  modo: ModoContrato;
  contratoId?: string;
  titulo: string;
  submitLabel?: string;
  backTo?: string;
  backLabel?: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Preenche parcelas ou valor quando só um dos dois foi informado. */
function resolverParcelas(
  qtdStr: string,
  valorStr: string,
  saldo: number,
  label: string,
): { parcelas: number; valorParcela: number } {
  if (saldo <= 0) {
    throw new Error(`${label}: saldo a parcelar deve ser maior que zero.`);
  }
  const qtd = qtdStr.trim() ? Number(qtdStr) : NaN;
  const valor = valorStr.trim() ? Number(valorStr) : NaN;
  const temQtd = Number.isFinite(qtd) && qtd > 0;
  const temValor = Number.isFinite(valor) && valor > 0;

  if (temQtd && temValor) {
    return { parcelas: Math.round(qtd), valorParcela: round2(valor) };
  }
  if (temQtd) {
    return { parcelas: Math.round(qtd), valorParcela: round2(saldo / qtd) };
  }
  if (temValor) {
    const parcelas = Math.max(1, Math.ceil(saldo / valor - 1e-9));
    return { parcelas, valorParcela: round2(valor) };
  }
  throw new Error(`${label}: informe a quantidade de parcelas ou o valor da parcela.`);
}

function ParcelamentoFields({
  titulo,
  entradaLabel,
  entrada,
  onEntradaChange,
  parcelas,
  onParcelasChange,
  valorParcela,
  onValorParcelaChange,
  disabled,
}: {
  titulo: string;
  entradaLabel: string;
  entrada: string;
  onEntradaChange: (v: string) => void;
  parcelas: string;
  onParcelasChange: (v: string) => void;
  valorParcela: string;
  onValorParcelaChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="form-section">
      <h3 className="form-section-title">{titulo}</h3>
      <div className="form-grid">
        <Field label={entradaLabel} hint="Deixe vazio ou 0 se nada foi pago na retirada">
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            value={entrada}
            onChange={(e) => onEntradaChange(e.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Quantidade de parcelas" hint="Ou preencha só o valor da parcela">
          <input
            className="input"
            type="number"
            min={1}
            step={1}
            value={parcelas}
            onChange={(e) => onParcelasChange(e.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Valor da parcela (R$)" hint="Calculado automaticamente se informar só a quantidade">
          <input
            className="input"
            type="number"
            step="0.01"
            min={0}
            value={valorParcela}
            onChange={(e) => onValorParcelaChange(e.target.value)}
            disabled={disabled}
          />
        </Field>
      </div>
    </div>
  );
}

export function ContratosCadastroSection({
  modo,
  contratoId,
  titulo,
  submitLabel = "Gerar Word/PDF",
  backTo = "/contratos",
  backLabel,
}: Props) {
  const navigate = useNavigate();
  const editando = Boolean(contratoId);

  const [placa, setPlaca] = useState("");
  const [cpf, setCpf] = useState("");
  const [semana, setSemana] = useState("");
  const [caucao, setCaucao] = useState("");
  const [periodo, setPeriodo] = useState("semana");
  const [parcelarCaucao, setParcelarCaucao] = useState(false);
  const [parcelarSemana, setParcelarSemana] = useState(false);
  const [caucaoEntrada, setCaucaoEntrada] = useState("");
  const [caucaoParcelasN, setCaucaoParcelasN] = useState("");
  const [caucaoValorParcela, setCaucaoValorParcela] = useState("");
  const [semanaEntrada, setSemanaEntrada] = useState("");
  const [semanaParcelasN, setSemanaParcelasN] = useState("");
  const [semanaValorParcela, setSemanaValorParcela] = useState("");
  const [carregando, setCarregando] = useState(editando);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => {
    if (!contratoId) return;
    let cancelado = false;
    setCarregando(true);
    setError(null);
    void lanzaApi
      .obterContrato(contratoId)
      .then((r) => {
        if (cancelado) return;
        const c = r.data;
        if (c.placa) setPlaca(c.placa);
        if (c.cpf) setCpf(c.cpf);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err instanceof LanzaApiError ? err.message : "Falha ao carregar contrato.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [contratoId]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const caucaoTotal = Number(caucao);
      const semanaTotal = Number(semana);
      if (!Number.isFinite(caucaoTotal) || caucaoTotal <= 0) {
        throw new Error("Informe o valor da caução.");
      }
      if (!Number.isFinite(semanaTotal) || semanaTotal <= 0) {
        throw new Error("Informe o valor semanal.");
      }

      const body: Record<string, unknown> = {
        placa: placa.trim(),
        cpf: cpf.trim() || undefined,
        semana: semanaTotal,
        caucao: caucaoTotal,
        periodo: periodo.trim() || undefined,
      };

      if (modo === "criar" && parcelarCaucao) {
        const entrada = caucaoEntrada.trim() ? Number(caucaoEntrada) : 0;
        const saldo = round2(caucaoTotal - (Number.isFinite(entrada) ? entrada : 0));
        const { parcelas, valorParcela } = resolverParcelas(
          caucaoParcelasN,
          caucaoValorParcela,
          saldo,
          "Caução",
        );
        body.caucaoParcelasN = parcelas;
        body.caucaoValorParcela = valorParcela;
        if (entrada > 0) {
          body.caucaoSaldoAberto = saldo;
        }
      }

      if (modo === "criar" && parcelarSemana) {
        const entrada = semanaEntrada.trim() ? Number(semanaEntrada) : 0;
        if (!Number.isFinite(entrada) || entrada < 0) {
          throw new Error("Valor pago na retirada inválido (1ª semana).");
        }
        const saldo = round2(semanaTotal - entrada);
        const { parcelas, valorParcela } = resolverParcelas(
          semanaParcelasN,
          semanaValorParcela,
          saldo,
          "1ª semana",
        );
        body.semanaEntrada = entrada;
        body.semanaParcelasN = parcelas;
        body.semanaValorParcela = valorParcela;
      }

      const fn = modo === "criar" ? lanzaApi.criarContrato : lanzaApi.renovarContrato;
      const r = await fn(body);
      setResult(r);
      navigate("/contratos");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : err instanceof Error ? err.message : "Falha ao gerar contrato.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to={backTo} label={backLabel} />
        <p className="muted">A carregar contrato…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to={backTo} label={backLabel} />
      <FormCard title={titulo} onSubmit={submit} loading={loading} submitLabel={submitLabel} error={error}>
        <Field label="Veículo">
          <VeiculoSelect value={placa} onChange={setPlaca} required disabled={loading} />
        </Field>
        <Field label="Cliente">
          <ClienteSelect value={cpf} onChange={setCpf} valueField="cpf" disabled={loading} />
        </Field>
        <Field label="Valor semanal (R$)">
          <input
            className="input"
            type="number"
            step="0.01"
            value={semana}
            onChange={(e) => setSemana(e.target.value)}
            required
            disabled={loading}
          />
        </Field>
        <Field label="Caução (R$)">
          <input
            className="input"
            type="number"
            step="0.01"
            value={caucao}
            onChange={(e) => setCaucao(e.target.value)}
            required
            disabled={loading}
          />
        </Field>
        <Field label="Período">
          <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value)} disabled={loading}>
            <option value="semana">1 semana</option>
            <option value="15 dias">15 dias</option>
            <option value="3 meses">3 meses</option>
            <option value="6 meses">6 meses</option>
            <option value="1 ano">1 ano</option>
          </select>
        </Field>

        {modo === "criar" ? (
          <>
            <label className="field checkbox-label">
              <input
                type="checkbox"
                checked={parcelarCaucao}
                onChange={(e) => setParcelarCaucao(e.target.checked)}
                disabled={loading}
              />
              Parcelar caução
            </label>
            {parcelarCaucao ? (
              <ParcelamentoFields
                titulo="Parcelamento da caução (cláusula 3.3)"
                entradaLabel="Pago na retirada (R$)"
                entrada={caucaoEntrada}
                onEntradaChange={setCaucaoEntrada}
                parcelas={caucaoParcelasN}
                onParcelasChange={setCaucaoParcelasN}
                valorParcela={caucaoValorParcela}
                onValorParcelaChange={setCaucaoValorParcela}
                disabled={loading}
              />
            ) : null}

            <label className="field checkbox-label">
              <input
                type="checkbox"
                checked={parcelarSemana}
                onChange={(e) => setParcelarSemana(e.target.checked)}
                disabled={loading}
              />
              Parcelar 1ª semana
            </label>
            {parcelarSemana ? (
              <ParcelamentoFields
                titulo="Parcelamento da 1ª semana (cláusula 3.2)"
                entradaLabel="Pago na retirada (R$)"
                entrada={semanaEntrada}
                onEntradaChange={setSemanaEntrada}
                parcelas={semanaParcelasN}
                onParcelasChange={setSemanaParcelasN}
                valorParcela={semanaValorParcela}
                onValorParcelaChange={setSemanaValorParcela}
                disabled={loading}
              />
            ) : null}
          </>
        ) : null}
      </FormCard>
      <ResultPanel title="Contrato gerado" data={result} />
    </>
  );
}
