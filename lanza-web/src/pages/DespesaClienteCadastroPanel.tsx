import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Field, FormCard } from "@/components/FormCard";
import { ResultPanel } from "@/components/ResultPanel";
import { useClientes } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

const CATEGORIAS = [
  "Manutenção",
  "Locação semanal",
  "Caução",
  "Outros",
  "Pedágio",
  "Infração",
  "Estacionamento",
];

export function DespesaClienteCadastroPanel() {
  const qc = useQueryClient();
  const clientesQuery = useClientes(true);
  const [placa, setPlaca] = useState("");
  const [categoria, setCategoria] = useState("Manutenção");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [autoInfracao, setAutoInfracao] = useState("");
  const [condutorId, setCondutorId] = useState("");
  const [despesaIdCondutor, setDespesaIdCondutor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function criar() {
    setLoading(true);
    setError(null);
    const id = autoInfracao.trim() || `WEB-${Date.now()}`;
    try {
      const r = await lanzaApi.criarDespesaCliente(placa.trim(), {
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
      void qc.invalidateQueries({ queryKey: ["despesas-cliente"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao criar despesa.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmarCondutor() {
    if (!despesaIdCondutor.trim()) {
      setError("Informe o ID/auto da despesa.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await lanzaApi.confirmarCondutorDespesa(
        despesaIdCondutor.trim(),
        condutorId.trim() || null,
      );
      setResult(r);
      void qc.invalidateQueries({ queryKey: ["despesas-cliente"] });
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao confirmar condutor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="reneg-panel">
      <h2 className="form-card__title">Cadastro de despesa do cliente</h2>
      <FormCard title="Nova despesa" onSubmit={criar} loading={loading} submitLabel="Gravar" error={error}>
        <Field label="Placa (veiculoId)">
          <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} required />
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
          <input className="input" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} required />
        </Field>
        <Field label="Auto / ID (opcional)">
          <input className="input" value={autoInfracao} onChange={(e) => setAutoInfracao(e.target.value)} />
        </Field>
      </FormCard>

      <FormCard
        title="Confirmar condutor"
        onSubmit={confirmarCondutor}
        loading={loading}
        submitLabel="Confirmar"
        error={null}
      >
        <Field label="ID ou auto da despesa">
          <input className="input" value={despesaIdCondutor} onChange={(e) => setDespesaIdCondutor(e.target.value)} />
        </Field>
        <Field label="Condutor (cliente id)">
          <select className="select" value={condutorId} onChange={(e) => setCondutorId(e.target.value)}>
            <option value="">— Nenhum —</option>
            {(clientesQuery.data?.items ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome ?? c.id}
              </option>
            ))}
          </select>
        </Field>
      </FormCard>

      <ResultPanel title="Resultado" data={result} />
    </section>
  );
}
