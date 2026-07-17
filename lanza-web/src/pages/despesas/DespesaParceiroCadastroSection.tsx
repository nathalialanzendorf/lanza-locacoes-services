import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { VeiculoSelect, matchVeiculoSelectValue } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

type Props = {
  despesaId?: string;
};

export function DespesaParceiroCadastroSection({ despesaId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editando = Boolean(despesaId);

  const veiculosQuery = useVeiculos();
  const [veiculoPlaca, setVeiculoPlaca] = useState("");
  const [categoria, setCategoria] = useState("IPVA");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [carregando, setCarregando] = useState(editando);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => {
    if (!despesaId) return;
    let cancelado = false;
    setCarregando(true);
    setError(null);
    void lanzaApi
      .obterParceiroDespesa(despesaId)
      .then((r) => {
        if (cancelado) return;
        const d = r.data;
        if (d.placa) {
          setVeiculoPlaca(matchVeiculoSelectValue(veiculosQuery.data?.items, d.placa, "placa"));
        }
        if (d.categoria) setCategoria(d.categoria);
        if (d.descricao) setDescricao(d.descricao);
        if (d.valor != null) setValor(String(d.valor));
        if (d.competencia) setCompetencia(d.competencia);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err instanceof LanzaApiError ? err.message : "Falha ao carregar despesa.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [despesaId]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        placa: veiculoPlaca.trim(),
        categoria: categoria.trim(),
        descricao: descricao.trim(),
        valor: Number(valor),
        competencia: competencia.trim() || undefined,
      };
      const r = editando
        ? await lanzaApi.atualizarParceiroDespesa(despesaId!, body)
        : await lanzaApi.criarDespesaParceiro(body);
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["despesas-parceiro"] });
      navigate("/despesas/parceiro");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar despesa parceiro.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to="/despesas/parceiro" />
        <p className="muted">A carregar despesa…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to="/despesas/parceiro" />
      <FormCard
        title={editando ? "Editar despesa parceiro" : "Nova despesa parceiro"}
        onSubmit={submit}
        loading={loading}
        error={error}
      >
        <Field label="Veículo">
          <VeiculoSelect value={veiculoPlaca} onChange={setVeiculoPlaca} required disabled={loading} />
        </Field>
        <Field label="Categoria">
          <input className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} required />
        </Field>
        <Field label="Descrição">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
        <Field label="Valor">
          <input
            className="input"
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
        </Field>
        <Field label="Competência" hint="MM/AAAA">
          <input className="input" value={competencia} onChange={(e) => setCompetencia(e.target.value)} />
        </Field>
      </FormCard>
      <ResultPanel title="Resultado" data={result} />
    </>
  );
}
