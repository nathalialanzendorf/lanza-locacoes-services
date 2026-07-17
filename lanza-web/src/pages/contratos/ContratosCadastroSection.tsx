import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { ClienteSelect, VeiculoSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

type Props = {
  contratoId?: string;
  modoInicial?: "criar" | "renovar";
};

export function ContratosCadastroSection({ contratoId, modoInicial = "criar" }: Props) {
  const navigate = useNavigate();
  const editando = Boolean(contratoId);

  const [modo, setModo] = useState<"criar" | "renovar">(editando ? "renovar" : modoInicial);
  const [placa, setPlaca] = useState("");
  const [cpf, setCpf] = useState("");
  const [semana, setSemana] = useState("");
  const [caucao, setCaucao] = useState("");
  const [periodo, setPeriodo] = useState("semana");
  const [semanaEntrada, setSemanaEntrada] = useState("");
  const [semanaParcelasN, setSemanaParcelasN] = useState("");
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
        setModo("renovar");
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
      const body = {
        placa: placa.trim(),
        cpf: cpf.trim() || undefined,
        semana: Number(semana),
        caucao: Number(caucao),
        periodo: periodo.trim() || undefined,
        semanaEntrada: semanaEntrada.trim() ? Number(semanaEntrada) : undefined,
        semanaParcelasN: semanaParcelasN.trim() ? Number(semanaParcelasN) : undefined,
      };
      const fn = modo === "criar" ? lanzaApi.criarContrato : lanzaApi.renovarContrato;
      const r = await fn(body);
      setResult(r);
      navigate("/contratos");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gerar contrato.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to="/contratos" />
        <p className="muted">A carregar contrato…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to="/contratos" />
      <FormCard
        title={modo === "criar" ? "Novo contrato" : "Renovar contrato"}
        onSubmit={submit}
        loading={loading}
        submitLabel="Gerar Word/PDF"
        error={error}
      >
        {!editando ? (
          <Field label="Modo">
            <select className="select" value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}>
              <option value="criar">Criar</option>
              <option value="renovar">Renovar</option>
            </select>
          </Field>
        ) : null}
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
          />
        </Field>
        <Field label="Período">
          <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="semana">1 semana</option>
            <option value="15 dias">15 dias</option>
            <option value="3 meses">3 meses</option>
            <option value="6 meses">6 meses</option>
            <option value="1 ano">1 ano</option>
          </select>
        </Field>
        <Field label="1ª semana entrada (R$)" hint="Cláusula 3.2 — parcelado">
          <input
            className="input"
            type="number"
            step="0.01"
            value={semanaEntrada}
            onChange={(e) => setSemanaEntrada(e.target.value)}
          />
        </Field>
        <Field label="Semanas restantes parcelamento">
          <input
            className="input"
            type="number"
            min={0}
            value={semanaParcelasN}
            onChange={(e) => setSemanaParcelasN(e.target.value)}
          />
        </Field>
      </FormCard>
      <ResultPanel title="Contrato gerado" data={result} />
    </>
  );
}
