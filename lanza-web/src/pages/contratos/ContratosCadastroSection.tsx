import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { ClienteSelect, VeiculoSelect, NativeSelect } from "@/components/EntitySelects";
import { DateInput } from "@/components/DateInput";
import { Field, FormCard } from "@/components/FormCard";
import { Toggle } from "@/components/Toggle";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import {
  PERIODOS_CONTRATO,
  dataFimDePeriodo,
  diasEntreDatasBr,
  hojeDataBr,
  periodoDeDias,
} from "@/lib/contratoPrazo";

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
  const periodoInicial = modo === "renovar" ? "3 meses" : "semana";
  const inicioInicial = hojeDataBr();
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [dataInicio, setDataInicio] = useState(inicioInicial);
  const [dataFim, setDataFim] = useState(() => dataFimDePeriodo(inicioInicial, periodoInicial));
  const [periodoPersonalizado, setPeriodoPersonalizado] = useState(false);
  const [parcelarCaucao, setParcelarCaucao] = useState(false);
  const [parcelarSemana, setParcelarSemana] = useState(false);
  const [caucaoEntrada, setCaucaoEntrada] = useState("");
  const [caucaoParcelasN, setCaucaoParcelasN] = useState("");
  const [caucaoValorParcela, setCaucaoValorParcela] = useState("");
  const [caucaoAnterior, setCaucaoAnterior] = useState<number | null>(null);
  const [semanaEntrada, setSemanaEntrada] = useState("");
  const [semanaParcelasN, setSemanaParcelasN] = useState("");
  const [semanaValorParcela, setSemanaValorParcela] = useState("");
  const [carregando, setCarregando] = useState(editando);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  function handlePeriodoChange(valor: string) {
    setPeriodo(valor);
    setPeriodoPersonalizado(false);
    if (dataInicio.trim() && valor) {
      setDataFim(dataFimDePeriodo(dataInicio, valor));
    }
  }

  function handleDataInicioChange(valor: string) {
    setDataInicio(valor);
    if (!valor.trim()) return;
    if (periodoPersonalizado && dataFim.trim()) {
      const dias = diasEntreDatasBr(valor, dataFim);
      if (dias != null && dias > 0) return;
    }
    if (periodo && !periodoPersonalizado) {
      setDataFim(dataFimDePeriodo(valor, periodo));
    }
  }

  function handleDataFimChange(valor: string) {
    setDataFim(valor);
    if (!valor.trim() || !dataInicio.trim()) return;
    const dias = diasEntreDatasBr(dataInicio, valor);
    if (dias == null || dias <= 0) return;
    const per = periodoDeDias(dias);
    if (per) {
      setPeriodo(per);
      setPeriodoPersonalizado(false);
    } else {
      setPeriodo("");
      setPeriodoPersonalizado(true);
    }
  }

  useEffect(() => {
    if (!contratoId) return;
    let cancelado = false;
    setCarregando(true);
    setError(null);
    void lanzaApi
      .obterContrato(contratoId)
      .then((r) => {
        if (cancelado) return;
        const c = r.data as typeof r.data & {
          prazoDias?: number;
          valorSemanal?: number | null;
          valorCaucao?: number;
        };
        if (c.placa) setPlaca(c.placa);
        if (c.cpf) setCpf(c.cpf);
        if (c.valorSemanal != null) setSemana(String(c.valorSemanal));
        if (c.valorCaucao != null) {
          setCaucao(String(c.valorCaucao));
          if (modo === "renovar") setCaucaoAnterior(c.valorCaucao);
        }
        if (modo === "renovar") {
          const inicio = hojeDataBr();
          const per = c.prazoDias ? periodoDeDias(c.prazoDias) || "3 meses" : "3 meses";
          setDataInicio(inicio);
          setPeriodo(per);
          setPeriodoPersonalizado(false);
          setDataFim(dataFimDePeriodo(inicio, per));
        }
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
  }, [contratoId, modo]);

  const caucaoNumerica = Number(caucao);
  const caucaoComplementoRenovacao =
    modo === "renovar" && caucaoAnterior != null && Number.isFinite(caucaoNumerica)
      ? round2(caucaoNumerica - caucaoAnterior)
      : null;
  const mostrarParcelarCaucaoRenovacao =
    modo === "renovar" &&
    caucaoComplementoRenovacao != null &&
    caucaoComplementoRenovacao > 0;

  useEffect(() => {
    if (modo === "renovar" && !mostrarParcelarCaucaoRenovacao) {
      setParcelarCaucao(false);
    }
  }, [modo, mostrarParcelarCaucaoRenovacao]);

  function saldoCaucaoParcelavel(caucaoTotal: number): number {
    const entrada = caucaoEntrada.trim() ? Number(caucaoEntrada) : 0;
    const base =
      modo === "renovar" && caucaoAnterior != null
        ? round2(caucaoTotal - caucaoAnterior)
        : caucaoTotal;
    if (base <= 0) {
      throw new Error(
        modo === "renovar"
          ? "A caução da renovação deve ser maior que a do contrato anterior para parcelar o complemento."
          : "Informe um valor de caução válido para parcelamento.",
      );
    }
    return round2(base - (Number.isFinite(entrada) ? entrada : 0));
  }

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
      };

      const inicio = dataInicio.trim();
      const fim = dataFim.trim();
      if (!inicio) throw new Error("Informe a data de início.");
      if (!fim) throw new Error("Informe a data fim.");
      const dias = diasEntreDatasBr(inicio, fim);
      if (dias == null || dias <= 0) {
        throw new Error("A data fim deve ser posterior à data de início.");
      }
      body.inicio = inicio;
      body.dias = dias;
      const per = periodoDeDias(dias);
      if (per) body.periodo = per;

      if (parcelarCaucao) {
        const saldo = saldoCaucaoParcelavel(caucaoTotal);
        const { parcelas, valorParcela } = resolverParcelas(
          caucaoParcelasN,
          caucaoValorParcela,
          saldo,
          modo === "renovar" ? "Complemento de caução" : "Caução",
        );
        body.caucaoParcelasN = parcelas;
        body.caucaoValorParcela = valorParcela;
        const entrada = caucaoEntrada.trim() ? Number(caucaoEntrada) : 0;
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
          <VeiculoSelect value={placa} onChange={setPlaca} required variant="cadastro" disabled={loading} />
        </Field>
        <Field label="Cliente">
          <ClienteSelect value={cpf} onChange={setCpf} valueField="cpf" variant="cadastro" disabled={loading} />
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
        <div className="form-grid">
          <Field label="Data início">
            <DateInput
              value={dataInicio}
              onChange={handleDataInicioChange}
              disabled={loading}
              required
            />
          </Field>
          <Field label="Tempo do contrato">
            <NativeSelect
              value={periodo}
              onChange={handlePeriodoChange}
              variant="cadastro"
              allowEmpty={false}
              disabled={loading}
              aria-label="Tempo do contrato"
            >
              {periodoPersonalizado ? <option value="">Personalizado</option> : null}
              {PERIODOS_CONTRATO.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
            {periodoPersonalizado && dataInicio.trim() && dataFim.trim() ? (
              <span className="field__hint">
                {diasEntreDatasBr(dataInicio, dataFim)} dias (ajuste pela data fim)
              </span>
            ) : null}
          </Field>
          <Field label="Data fim">
            <DateInput value={dataFim} onChange={handleDataFimChange} disabled={loading} required />
          </Field>
        </div>

        {modo === "criar" || mostrarParcelarCaucaoRenovacao ? (
          <>
            <Toggle
              className="field"
              checked={parcelarCaucao}
              onChange={setParcelarCaucao}
              disabled={loading}
              label="Parcelar caução"
            />
            {modo === "renovar" && caucaoAnterior != null && caucaoComplementoRenovacao != null ? (
              <p className="field__hint">
                Caução anterior {caucaoAnterior.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                {" · "}
                complemento{" "}
                {caucaoComplementoRenovacao.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
            ) : null}
            {parcelarCaucao ? (
              <ParcelamentoFields
                titulo={
                  modo === "renovar"
                    ? "Parcelamento do complemento de caução (cláusula 3.3)"
                    : "Parcelamento da caução (cláusula 3.3)"
                }
                entradaLabel={modo === "renovar" ? "Pago na renovação (R$)" : "Pago na retirada (R$)"}
                entrada={caucaoEntrada}
                onEntradaChange={setCaucaoEntrada}
                parcelas={caucaoParcelasN}
                onParcelasChange={setCaucaoParcelasN}
                valorParcela={caucaoValorParcela}
                onValorParcelaChange={setCaucaoValorParcela}
                disabled={loading}
              />
            ) : null}
          </>
        ) : null}

        {modo === "criar" ? (
          <>
            <Toggle
              className="field"
              checked={parcelarSemana}
              onChange={setParcelarSemana}
              disabled={loading}
              label="Parcelar 1ª semana"
            />
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
