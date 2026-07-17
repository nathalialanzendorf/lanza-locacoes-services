import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { CadastroBackLink } from "@/components/CadastroBackLink";
import { DateInput } from "@/components/DateInput";
import { DocUploadField } from "@/components/DocUploadField";
import { Field, FormCard, FormSection } from "@/components/FormCard";
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

type Props = {
  clienteId?: string;
};

export function ClientesCadastroSection({ clienteId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const editando = Boolean(clienteId);

  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [cnhNumero, setCnhNumero] = useState("");
  const [cnhCategoria, setCnhCategoria] = useState("");
  const [cnhValidade, setCnhValidade] = useState("");
  const [telefone, setTelefone] = useState("");
  const [endereco, setEndereco] = useState<EnderecoForm>(enderecoVazio);
  const [documentosLidos, setDocumentosLidos] = useState(false);
  const [carregando, setCarregando] = useState(editando);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function popularFormulario(c: Record<string, unknown>) {
    if (typeof c.nome === "string") setNome(c.nome);
    if (typeof c.cpf === "string") setCpf(c.cpf);
    const tel = c.telefone ?? c.contato;
    if (typeof tel === "string") setTelefone(tel);

    const cnh = c.cnh;
    if (cnh && typeof cnh === "object" && !Array.isArray(cnh)) {
      const o = cnh as Record<string, unknown>;
      if (typeof o.numeroRegistro === "string") setCnhNumero(o.numeroRegistro);
      if (typeof o.categoria === "string") setCnhCategoria(o.categoria);
      if (typeof o.validade === "string") setCnhValidade(o.validade);
    }

    const end = c.endereco;
    if (end && typeof end === "object" && !Array.isArray(end)) {
      const e = end as Record<string, unknown>;
      setEndereco({
        cep: typeof e.cep === "string" ? e.cep : "",
        logradouro: typeof e.logradouro === "string" ? e.logradouro : "",
        numero: typeof e.numero === "string" ? e.numero : "",
        complemento: typeof e.complemento === "string" ? e.complemento : "",
        bairro: typeof e.bairro === "string" ? e.bairro : "",
        cidade: typeof e.cidade === "string" ? e.cidade : "",
        uf: typeof e.uf === "string" ? e.uf : "",
      });
    }
  }

  function marcarDocumentoLido() {
    setDocumentosLidos(true);
    setError(null);
  }

  function aplicarCnh(campos: Record<string, unknown>) {
    marcarDocumentoLido();
    if (typeof campos.nome === "string" && campos.nome.trim()) setNome(campos.nome.trim());
    if (typeof campos.cpf === "string" && campos.cpf.trim()) setCpf(campos.cpf.trim());
    const cnh = campos.cnh as Record<string, string> | undefined;
    if (cnh?.numeroRegistro) setCnhNumero(cnh.numeroRegistro);
    if (cnh?.categoria) setCnhCategoria(cnh.categoria);
    if (cnh?.validade) setCnhValidade(cnh.validade);
  }

  function aplicarComprovante(campos: Record<string, unknown>) {
    marcarDocumentoLido();
    if (typeof campos.titular === "string" && campos.titular.trim() && !nome.trim()) {
      setNome(campos.titular.trim());
    }
    const tel = campos.telefone;
    if (typeof tel === "string" && tel.trim()) setTelefone(tel.trim());

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

  useEffect(() => {
    if (!clienteId) return;
    let cancelado = false;
    setCarregando(true);
    setError(null);
    void lanzaApi
      .obterCliente(clienteId)
      .then((r) => {
        if (cancelado) return;
        popularFormulario(r.data as unknown as Record<string, unknown>);
      })
      .catch((err) => {
        if (cancelado) return;
        setError(err instanceof LanzaApiError ? err.message : "Falha ao carregar cliente.");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  async function gravar() {
    if (!nome.trim()) {
      setError(
        editando
          ? "Informe o nome do cliente."
          : "Envie os documentos ou preencha o nome manualmente antes de salvar.",
      );
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

      const body = {
        nome: nome.trim(),
        cpf: cpf.trim() || undefined,
        cnh: cnhPayload,
        contato: telefone.trim() || undefined,
        telefone: telefone.trim() || undefined,
        endereco: enderecoPayload,
        ...(editando
          ? {}
          : {
              origemImportacao: documentosLidos ? "web-importar-documento" : "web-cadastro",
            }),
      };

      if (editando) {
        await lanzaApi.atualizarCliente(clienteId!, body);
      } else {
        await lanzaApi.criarCliente(body);
      }
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      navigate("/clientes");
    } catch (err) {
      setError(err instanceof LanzaApiError ? err.message : "Falha ao gravar cliente.");
    } finally {
      setLoading(false);
    }
  }

  if (carregando) {
    return (
      <>
        <CadastroBackLink to="/clientes" />
        <p className="muted">A carregar cliente…</p>
      </>
    );
  }

  return (
    <>
      <CadastroBackLink to="/clientes" />
      <FormCard
        title={editando ? "Editar cliente" : "Novo cliente"}
        onSubmit={gravar}
        loading={loading}
        error={error}
      >
        {!editando ? (
          <FormSection
            title="Importar"
            hint="Envie a CNH e o comprovante de residência. Os campos abaixo são preenchidos automaticamente e podem ser editados."
          >
            <div className="doc-upload-row">
              <DocUploadField
                label="CNH (PDF)"
                tipo="cnh"
                disabled={loading}
                onParsed={({ campos }) => aplicarCnh(campos)}
                onError={setError}
              />
              <DocUploadField
                label="Comprovante de residência"
                tipo="comprovante-residencia"
                hint="Confira se o titular é o locatário."
                disabled={loading}
                onParsed={({ campos }) => aplicarComprovante(campos)}
                onError={setError}
              />
            </div>
          </FormSection>
        ) : null}

        <FormSection
          title="Identificação"
          hint={
            !editando && documentosLidos
              ? "Dados extraídos dos documentos — confira antes de salvar."
              : undefined
          }
        >
          <div className="form-grid">
            <Field label="Nome" span="wide">
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} />
            </Field>
            <Field label="CPF">
              <input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} />
            </Field>
            <Field label="Telefone" span="wide">
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="CNH">
          <div className="form-grid">
            <Field label="Nº registro">
              <input className="input" value={cnhNumero} onChange={(e) => setCnhNumero(e.target.value)} />
            </Field>
            <Field label="Categoria">
              <input className="input" value={cnhCategoria} onChange={(e) => setCnhCategoria(e.target.value)} />
            </Field>
            <Field label="Validade">
              <DateInput value={cnhValidade} onChange={setCnhValidade} disabled={loading} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Endereço">
          <div className="form-grid">
            <Field label="CEP">
              <input className="input" value={endereco.cep} onChange={(e) => setEndereco({ ...endereco, cep: e.target.value })} />
            </Field>
            <Field label="Número">
              <input className="input" value={endereco.numero} onChange={(e) => setEndereco({ ...endereco, numero: e.target.value })} />
            </Field>
            <Field label="UF">
              <input className="input" value={endereco.uf} onChange={(e) => setEndereco({ ...endereco, uf: e.target.value })} maxLength={2} />
            </Field>
            <Field label="Logradouro" span="full">
              <input
                className="input"
                value={endereco.logradouro}
                onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })}
              />
            </Field>
            <Field label="Complemento" span="wide">
              <input
                className="input"
                value={endereco.complemento}
                onChange={(e) => setEndereco({ ...endereco, complemento: e.target.value })}
              />
            </Field>
            <Field label="Bairro">
              <input className="input" value={endereco.bairro} onChange={(e) => setEndereco({ ...endereco, bairro: e.target.value })} />
            </Field>
            <Field label="Cidade" span="wide">
              <input className="input" value={endereco.cidade} onChange={(e) => setEndereco({ ...endereco, cidade: e.target.value })} />
            </Field>
          </div>
        </FormSection>
      </FormCard>
    </>
  );
}
