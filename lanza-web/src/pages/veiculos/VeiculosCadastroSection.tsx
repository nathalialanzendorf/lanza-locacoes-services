import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { Toggle } from "@/components/Toggle";
import { ParceiroSelect } from "@/components/EntitySelects";
import { Field, FormCard } from "@/components/FormCard";
import { useVinculosParceiro } from "@/api/hooks";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";
import {
  statusVeiculoClass,
  statusVeiculoLabel,
  statusVeiculoOperacional,
} from "@/lib/statusVeiculo";

type Props = {
  veiculoId?: string;
};

export function VeiculosCadastroSection({ veiculoId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editando = Boolean(veiculoId);

  const vinculosQuery = useVinculosParceiro(
    veiculoId ? { veiculoId } : undefined,
  );

  const [placa, setPlaca] = useState("");
  const [marcaModelo, setMarcaModelo] = useState("");
  const [anoModelo, setAnoModelo] = useState("");
  const [chassi, setChassi] = useState("");
  const [renavam, setRenavam] = useState("");
  const [cor, setCor] = useState("");
  const [ufRegistro, setUfRegistro] = useState("SC");
  const [parceiroId, setParceiroId] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [clienteVinculadoId, setClienteVinculadoId] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(editando);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function popularFormulario(v: Record<string, unknown>) {
    if (typeof v.placa === "string") setPlaca(v.placa);
    if (typeof v.marcaModelo === "string") setMarcaModelo(v.marcaModelo);
    if (typeof v.anoModelo === "string") setAnoModelo(v.anoModelo);
    if (typeof v.chassi === "string") setChassi(v.chassi);
    if (typeof v.renavam === "string") setRenavam(v.renavam);
    if (typeof v.cor === "string") setCor(v.cor);
    if (typeof v.ufRegistro === "string") setUfRegistro(v.ufRegistro);
    if (typeof v.ativo === "boolean") setAtivo(v.ativo);
    if (typeof v.clienteVinculadoId === "string") setClienteVinculadoId(v.clienteVinculadoId);
    else if (v.clienteVinculadoId === null) setClienteVinculadoId(null);
  }

  useEffect(() => {
    if (!editando || !veiculoId) return;
    const vinculo = vinculosQuery.data?.items?.[0];
    if (vinculo?.parceiroId) setParceiroId(vinculo.parceiroId);
  }, [editando, veiculoId, vinculosQuery.data]);

  useEffect(() => {
    if (!veiculoId) return;
    let cancelado = false;
    setCarregando(true);
    setError(null);
    void lanzaApi
      .obterVeiculo(veiculoId)
      .then((r) => {
        if (cancelado) return;
        popularFormulario(r.data as unknown as Record<string, unknown>);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err instanceof LanzaApiError ? err.message : "Falha ao carregar veículo.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [veiculoId]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        placa: placa.trim(),
        marcaModelo: marcaModelo.trim() || undefined,
        anoModelo: anoModelo.trim() || undefined,
        chassi: chassi.trim() || undefined,
        renavam: renavam.trim() || undefined,
        cor: cor.trim() || undefined,
        ufRegistro: ufRegistro.trim() || undefined,
        parceiroId: parceiroId.trim() || undefined,
        ativo,
        ...(editando ? {} : { origem: "web-cadastro" }),
      };

      if (editando) {
        await lanzaApi.atualizarVeiculo(veiculoId!, body);
      } else {
        await lanzaApi.criarVeiculo(body);
      }

      void qc.invalidateQueries({ queryKey: ["veiculos"] });
      void qc.invalidateQueries({ queryKey: ["parceiros"] });
      navigate("/veiculos");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar veículo.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to="/veiculos" />
        <p className="muted">A carregar veículo…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to="/veiculos" />
      <FormCard
        title={editando ? "Editar veículo" : "Novo veículo"}
        onSubmit={submit}
        loading={loading}
        error={error}
      >
        <Field label="Placa">
          <input className="input" value={placa} onChange={(e) => setPlaca(e.target.value)} required />
        </Field>
        <Field label="Marca / modelo">
          <input className="input" value={marcaModelo} onChange={(e) => setMarcaModelo(e.target.value)} />
        </Field>
        <Field label="Ano / modelo">
          <input
            className="input"
            value={anoModelo}
            onChange={(e) => setAnoModelo(e.target.value)}
            placeholder="2012/2013"
          />
        </Field>
        <Field label="Chassi">
          <input className="input" value={chassi} onChange={(e) => setChassi(e.target.value)} />
        </Field>
        <Field label="RENAVAM">
          <input className="input" value={renavam} onChange={(e) => setRenavam(e.target.value)} />
        </Field>
        <Field label="Cor">
          <input className="input" value={cor} onChange={(e) => setCor(e.target.value)} />
        </Field>
        <Field label="UF registro">
          <input className="input" value={ufRegistro} onChange={(e) => setUfRegistro(e.target.value)} />
        </Field>
        <Field label="Parceiro (proprietário)">
          <ParceiroSelect value={parceiroId} onChange={setParceiroId} variant="cadastro" disabled={loading} />
        </Field>
        <Field label="Status operacional">
          <span
            className={statusVeiculoClass(
              statusVeiculoOperacional({ ativo, clienteVinculadoId }),
            )}
          >
            {statusVeiculoLabel(statusVeiculoOperacional({ ativo, clienteVinculadoId }))}
          </span>
          <span className="field__hint">
            Locado vem do contrato ativo. Use o toggle abaixo para inativar ou reativar.
          </span>
        </Field>
        <Field label="Frota" hint="Inativo sai da frota operacional">
          <Toggle
            checked={ativo}
            onChange={setAtivo}
            disabled={loading}
            aria-label="Veículo ativo na frota"
          />
        </Field>
      </FormCard>
    </>
  );
}
