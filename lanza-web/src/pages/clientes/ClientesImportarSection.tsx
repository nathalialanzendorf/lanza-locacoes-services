import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { DocUploadField } from "@/components/DocUploadField";
import { Field, FormCard } from "@/components/FormCard";
import { lanzaApi } from "@/api/endpoints";
import { LanzaApiError } from "@/api/client";

type EnderecoForm = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

const enderecoVazio: EnderecoForm = {
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

export function ClientesImportarSection() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [cnhNumero, setCnhNumero] = useState("");
  const [cnhCategoria, setCnhCategoria] = useState("");
  const [cnhValidade, setCnhValidade] = useState("");
  const [contato, setContato] = useState("");
  const [endereco, setEndereco] = useState<EnderecoForm>(enderecoVazio);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function aplicarCnh(campos: Record<string, unknown>) {
    if (typeof campos.nome === "string" && campos.nome.trim()) setNome(campos.nome.trim());
    if (typeof campos.cpf === "string" && campos.cpf.trim()) setCpf(campos.cpf.trim());
    const cnh = campos.cnh as Record<string, string> | undefined;
    if (cnh?.numeroRegistro) setCnhNumero(cnh.numeroRegistro);
    if (cnh?.categoria) setCnhCategoria(cnh.categoria);
    if (cnh?.validade) setCnhValidade(cnh.validade);
  }

  function aplicarComprovante(campos: Record<string, unknown>) {
    if (typeof campos.titular === "string" && campos.titular.trim() && !nome.trim()) {
      setNome(campos.titular.trim());
    }
    const tel = campos.telefone;
    const email = campos.email;
    if (typeof tel === "string" && tel.trim()) setContato(tel.trim());
    else if (typeof email === "string" && email.trim()) setContato(email.trim());

    const end = campos.endereco as Record<string, string | null | undefined> | undefined;
    if (!end) return;
    setEndereco((prev) => ({
      cep: end.cep ?? prev.cep,
      logradouro: end.logradouro ?? prev.logradouro,
      numero: end.numero ?? prev.numero,
      complemento: end.complemento ?? prev.complemento,
      bairro: end.bairro ?? prev.bairro,
      cidade: end.cidade ?? prev.cidade,
      uf: end.uf ?? prev.uf,
    }));
  }

  async function salvar() {
    if (!nome.trim()) {
      setError("Nome obrigatório — envie a CNH ou informe manualmente.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cnhPayload =
        cnhNumero.trim() || cnhCategoria.trim() || cnhValidade.trim()
          ? {
              numeroRegistro: cnhNumero.trim() || undefined,
              categoria: cnhCategoria.trim() || undefined,
              validade: cnhValidade.trim() || undefined,
            }
          : undefined;

      const enderecoPayload = Object.values(endereco).some((v) => v.trim())
        ? {
            cep: endereco.cep.trim() || null,
            logradouro: endereco.logradouro.trim() || null,
            numero: endereco.numero.trim() || null,
            complemento: endereco.complemento.trim() || null,
            bairro: endereco.bairro.trim() || null,
            cidade: endereco.cidade.trim() || null,
            uf: endereco.uf.trim() || null,
          }
        : undefined;

      await lanzaApi.criarCliente({
        nome: nome.trim(),
        cpf: cpf.trim() || undefined,
        cnh: cnhPayload,
        contato: contato.trim() || undefined,
        telefone: contato.trim() || undefined,
        endereco: enderecoPayload,
        origemImportacao: "web-importar-documento",
      });

      void qc.invalidateQueries({ queryKey: ["clientes"] });
      navigate("/clientes");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao salvar cliente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CadastroBackLink to="/clientes" />
      <FormCard title="Importar cliente" onSubmit={salvar} loading={loading} error={error}>
        <DocUploadField
          label="CNH (PDF)"
          tipo="cnh"
          hint="Envie o PDF da CNH para preencher nome, CPF e dados da habilitação."
          disabled={loading}
          onParsed={({ campos }) => aplicarCnh(campos)}
          onError={setError}
        />
        <DocUploadField
          label="Comprovante de residência (PDF)"
          tipo="comprovante-residencia"
          hint="Boleto ou comprovante com endereço — confira se o titular é o locatário."
          disabled={loading}
          onParsed={({ campos }) => aplicarComprovante(campos)}
          onError={setError}
        />

        <Field label="Nome">
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        <Field label="CPF">
          <input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        </Field>
        <Field label="Contato (telefone ou e-mail)">
          <input className="input" value={contato} onChange={(e) => setContato(e.target.value)} />
        </Field>
        <Field label="CNH — nº registro">
          <input className="input" value={cnhNumero} onChange={(e) => setCnhNumero(e.target.value)} />
        </Field>
        <Field label="CNH — categoria">
          <input className="input" value={cnhCategoria} onChange={(e) => setCnhCategoria(e.target.value)} />
        </Field>
        <Field label="CNH — validade">
          <input className="input" value={cnhValidade} onChange={(e) => setCnhValidade(e.target.value)} />
        </Field>

        <p className="form-section-title">Endereço (comprovante)</p>
        <Field label="CEP">
          <input className="input" value={endereco.cep} onChange={(e) => setEndereco({ ...endereco, cep: e.target.value })} />
        </Field>
        <Field label="Logradouro">
          <input
            className="input"
            value={endereco.logradouro}
            onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })}
          />
        </Field>
        <Field label="Número">
          <input className="input" value={endereco.numero} onChange={(e) => setEndereco({ ...endereco, numero: e.target.value })} />
        </Field>
        <Field label="Complemento">
          <input
            className="input"
            value={endereco.complemento}
            onChange={(e) => setEndereco({ ...endereco, complemento: e.target.value })}
          />
        </Field>
        <Field label="Bairro">
          <input className="input" value={endereco.bairro} onChange={(e) => setEndereco({ ...endereco, bairro: e.target.value })} />
        </Field>
        <Field label="Cidade">
          <input className="input" value={endereco.cidade} onChange={(e) => setEndereco({ ...endereco, cidade: e.target.value })} />
        </Field>
        <Field label="UF">
          <input className="input" value={endereco.uf} onChange={(e) => setEndereco({ ...endereco, uf: e.target.value })} />
        </Field>
      </FormCard>
    </>
  );
}
