import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { DocUploadField } from "@/components/DocUploadField";
import { useRastreameEspelho } from "@/hooks/useRastreameEspelho";

import { Field, FormCard } from "@/components/FormCard";

import { ResultPanel } from "@/components/ResultPanel";

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



export function ClientesCadastroSection() {

  const qc = useQueryClient();
  const { ativo: espelhoRastreame } = useRastreameEspelho();

  const [modo, setModo] = useState<"manual" | "importar">("manual");

  const [nome, setNome] = useState("");

  const [cpf, setCpf] = useState("");

  const [cnhNumero, setCnhNumero] = useState("");

  const [cnhCategoria, setCnhCategoria] = useState("");

  const [cnhValidade, setCnhValidade] = useState("");

  const [contato, setContato] = useState("");

  const [endereco, setEndereco] = useState<EnderecoForm>(enderecoVazio);

  const [raizCnh, setRaizCnh] = useState("");

  const [dryRun, setDryRun] = useState(true);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<unknown>(null);



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



  async function gravarManual() {

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



      const r = await lanzaApi.criarCliente({

        nome: nome.trim(),

        cpf: cpf.trim() || undefined,

        cnh: cnhPayload,

        contato: contato.trim() || undefined,

        telefone: contato.trim() || undefined,

        endereco: enderecoPayload,

        origemImportacao: "web-upload-documento",

      });

      setResult(r);

      void qc.invalidateQueries({ queryKey: ["clientes"] });

    } catch (err) {

      setError(err instanceof LanzaApiError ? err.message : "Falha ao cadastrar cliente.");

    } finally {

      setLoading(false);

    }

  }



  async function importarCnh() {

    setLoading(true);

    setError(null);

    try {

      const r = await lanzaApi.importarCnh({

        raiz: raizCnh.trim() || undefined,

        dryRun,

        comRastreame: espelhoRastreame && !dryRun,

      });

      setResult(r);

      if (!dryRun) void qc.invalidateQueries({ queryKey: ["clientes"] });

    } catch (err) {

      setError(err instanceof LanzaApiError ? err.message : "Falha na importação CNH.");

    } finally {

      setLoading(false);

    }

  }



  async function previewCnh() {

    setLoading(true);

    setError(null);

    try {

      const r = await lanzaApi.previewImportacaoCnh(raizCnh.trim() || undefined);

      setResult(r);

    } catch (err) {

      setError(err instanceof LanzaApiError ? err.message : "Falha no preview CNH.");

    } finally {

      setLoading(false);

    }

  }



  return (

    <>

      <div className="despesas-toolbar">

        <select className="select" value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}>

          <option value="manual">Cadastro manual / importar documentos</option>

          <option value="importar">Importar de pastas CNH (lote)</option>

        </select>

      </div>



      {modo === "manual" ? (

        <FormCard

          title="Novo cliente"

          onSubmit={gravarManual}

          loading={loading}

          submitLabel="Gravar cliente"

          error={error}

        >

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

            <input className="input" value={endereco.logradouro} onChange={(e) => setEndereco({ ...endereco, logradouro: e.target.value })} />

          </Field>

          <Field label="Número">

            <input className="input" value={endereco.numero} onChange={(e) => setEndereco({ ...endereco, numero: e.target.value })} />

          </Field>

          <Field label="Complemento">

            <input className="input" value={endereco.complemento} onChange={(e) => setEndereco({ ...endereco, complemento: e.target.value })} />

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

      ) : (

        <>

          <FormCard

            title="Importar clientes (CNH)"

            onSubmit={importarCnh}

            loading={loading}

            submitLabel={
              dryRun
                ? "Simular importação"
                : espelhoRastreame
                  ? "Importar (Lanza + espelho Rastreame)"
                  : "Importar (só Lanza)"
            }

            error={error}

          >

            <Field label="Raiz documentos" hint="Pasta Aluguel Carros (opcional — usa config)">

              <input className="input" value={raizCnh} onChange={(e) => setRaizCnh(e.target.value)} />

            </Field>

            <label className="field checkbox-label">

              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />

              Dry-run (simular)

            </label>

          </FormCard>

          <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => void previewCnh()}>

            Preview pastas CNH

          </button>

        </>

      )}



      <ResultPanel title="Resultado" data={result} />

    </>

  );

}


