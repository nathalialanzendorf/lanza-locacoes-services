import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { ClienteSelect, VeiculoSelect, matchVeiculoSelectValue } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useVeiculos } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import { clienteIdDe } from "@/lib/clienteCampo";

const CATEGORIAS = [
  "Manutenção",
  "Locação semanal",
  "Caução",
  "Outros",
  "Pedágio",
  "Infração",
  "Estacionamento",
];

type Props = {
  despesaId?: string;
};

export function DespesaClienteCadastroSection({ despesaId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editando = Boolean(despesaId);
  const veiculosQuery = useVeiculos();

  const [veiculoId, setVeiculoId] = useState("");
  const [categoria, setCategoria] = useState("Manutenção");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [autoInfracao, setAutoInfracao] = useState("");
  const [clienteId, setClienteId] = useState("");
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
      .obterDespesaCliente(despesaId)
      .then((r) => {
        if (cancelado) return;
        const d = r.data;
        if (d.veiculoId) setVeiculoId(d.veiculoId);
        else if (d.placa) {
          setVeiculoId(matchVeiculoSelectValue(veiculosQuery.data?.items, d.placa, "id"));
        }
        if (d.categoria) setCategoria(d.categoria);
        if (d.descricao) setDescricao(d.descricao);
        if (d.valorMulta != null) setValor(String(d.valorMulta));
        if (d.autoInfracao) setAutoInfracao(d.autoInfracao);
        const id = clienteIdDe(d);
        if (id) setClienteId(id);
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

  async function gravar() {
    setLoading(true);
    setError(null);
    try {
      if (editando) {
        const r = await lanzaApi.atualizarDespesaCliente(despesaId!, {
          categoria,
          descricao: descricao.trim() || undefined,
          valorMulta: Number(valor),
        });
        setResult(r);
      } else {
        const id = autoInfracao.trim() || `WEB-${Date.now()}`;
        const r = await lanzaApi.criarDespesaCliente(veiculoId.trim(), {
          autoInfracao: id,
          descricao: descricao.trim() || (categoria === "Manutenção" ? "Acionamento Franquia" : "Despesa cliente"),
          localInfracao: "",
          dataAutuacao: new Date().toLocaleDateString("pt-BR"),
          valorMulta: Number(valor),
          situacao: "Em aberto",
          limiteDefesa: "",
          categoria,
          paga: false,
          rastreameTipo: categoria === "Manutenção" ? "ALIMENTACAO" : "OUTROS",
        });
        setResult(r);
      }
      void qc.invalidateQueries({ queryKey: ["despesas-cliente"] });
      navigate("/despesas/cliente");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar despesa.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmarCliente() {
    if (!editando || !despesaId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.confirmarClienteDespesa(despesaId, clienteId.trim() || null);
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["despesas-cliente"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao confirmar cliente.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to="/despesas/cliente" />
        <p className="muted">A carregar despesa…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to="/despesas/cliente" />
      <FormCard
        title={editando ? "Editar despesa do cliente" : "Nova despesa do cliente"}
        onSubmit={gravar}
        loading={loading}
        error={error}
      >
        <Field label="Veículo">
          <VeiculoSelect
            value={veiculoId}
            onChange={setVeiculoId}
            valueField="id"
            required
            disabled={loading || editando}
          />
        </Field>
        <Field label="Categoria">
          <select className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Descrição">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
        <Field label="Valor (R$)">
          <input
            className="input"
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
        </Field>
        {!editando ? (
          <Field label="Auto / ID (opcional)">
            <input className="input" value={autoInfracao} onChange={(e) => setAutoInfracao(e.target.value)} />
          </Field>
        ) : null}
      </FormCard>

      {editando ? (
        <FormCard
          title="Confirmar cliente"
          onSubmit={confirmarCliente}
          loading={loading}
          submitLabel="Confirmar cliente"
          error={null}
        >
          <Field label="Cliente">
            <ClienteSelect value={clienteId} onChange={setClienteId} disabled={loading} />
          </Field>
        </FormCard>
      ) : null}

      <ResultPanel title="Resultado" data={result} />
    </>
  );
}
