import fs from "node:fs";
import path from "node:path";

import {
  REPO_ROOT,
  analiseClienteDeRegistro,
  caminhoBase,
  executarTriagem,
  gravarRelatorio,
  listarTriagensAsync,
  loadClientesDbAsync,
  loadTriagemDbAsync,
  montarRelatorio,
  registrarAchadosCliente,
  registrarAnaliseCadastroNoCliente,
  registrarTriagemAsync,
  saveTriagemDbAsync,
  type DadosLgpd,
  type DadosLocatario,
  type FonteId,
  type RelatorioTriagem,
  type ResultadoFonte,
  type TriagemRegistro,
} from "../lib-imports.js";
import { HttpError } from "../http.js";

const TJSC_FLAG = path.join(
  REPO_ROOT,
  "relatorios",
  "_tmp",
  "analise-cadastro",
  "tjsc-done.flag",
);

export type AnaliseCadastroInput = {
  cpf: string;
  nome: string;
  nascimento: string;
  baseLegal: string;
  titular?: string;
  solicitante?: string | null;
  maeNome?: string | null;
  paiNome?: string | null;
  ufNascimento?: string | null;
  municipioNascimento?: string | null;
  rg?: string | null;
  orgaoExpedidor?: string | null;
  ufResidencia?: string | null;
  municipioResidencia?: string | null;
  enderecoResidencia?: string | null;
  emailResposta?: string | null;
  telefone?: string | null;
  finalidade?: string | null;
  fontes?: FonteId[];
  timeoutMin?: number;
  semBrowser?: boolean;
  aprovar?: boolean;
  reprovar?: boolean;
  clienteId?: string;
  semVinculo?: boolean;
  outDir?: string;
};

function cpfDigits(cpf: string): string {
  return String(cpf ?? "").replace(/\D/g, "");
}

function cpfFormatado(cpf: string): string {
  const d = cpfDigits(cpf);
  return d.length === 11
    ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    : cpf;
}

function cpfValido(cpf: string): boolean {
  const d = cpfDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const calc = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(d.slice(0, 9), 10) === Number(d[9]) && calc(d.slice(0, 10), 11) === Number(d[10]);
}

function dataValida(s: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  if (!m) return false;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const dt = new Date(ano, mes - 1, dia);
  if (dt.getFullYear() !== ano || dt.getMonth() !== mes - 1 || dt.getDate() !== dia) return false;
  if (dt.getTime() > Date.now()) return false;
  return ano >= 1900;
}

function fontesPendentes(): ResultadoFonte[] {
  const agora = new Date().toISOString();
  return [
    {
      id: "bnmp",
      nome: "CNJ BNMP — mandados de prisão / procurados",
      status: "pendente",
      alerta: false,
      observacao: "Não consultado (--sem-browser).",
      achados: [],
      consultadoEm: agora,
    },
    {
      id: "pf-sinic",
      nome: "PF SINIC — certidão de antecedentes criminais (nacional)",
      status: "pendente",
      alerta: false,
      observacao: "Não consultado (--sem-browser).",
      achados: [],
      evidencia: null,
      consultadoEm: agora,
    },
    {
      id: "tjsc",
      nome: "TJSC — certidão criminal estadual (eproc)",
      status: "pendente",
      alerta: false,
      observacao: "Não consultado (--sem-browser).",
      achados: [],
      consultadoEm: agora,
    },
  ];
}

function mesclarFontes(base: string, novas: ResultadoFonte[]): ResultadoFonte[] {
  let anteriores: ResultadoFonte[] = [];
  const arq = `${base}.json`;
  try {
    if (fs.existsSync(arq)) {
      const r = JSON.parse(fs.readFileSync(arq, "utf8")) as { fontes?: ResultadoFonte[] };
      if (Array.isArray(r.fontes)) anteriores = r.fontes;
    }
  } catch {
    /* ignore */
  }
  const porId = new Map<string, ResultadoFonte>();
  for (const f of anteriores) porId.set(f.id, f);
  for (const f of novas) porId.set(f.id, f);
  const ordem = ["bnmp", "pf-sinic", "tjsc"];
  return [...porId.values()].sort(
    (a, b) => (ordem.indexOf(a.id) + 1 || 99) - (ordem.indexOf(b.id) + 1 || 99),
  );
}

function aguardarFimTjsc(timeoutMin: number): Promise<void> {
  try {
    fs.mkdirSync(path.dirname(TJSC_FLAG), { recursive: true });
    fs.rmSync(TJSC_FLAG, { force: true });
  } catch {
    /* best-effort */
  }
  const deadline = Date.now() + Math.max(1, timeoutMin) * 60 * 1000;
  return new Promise((resolve) => {
    const t = setInterval(() => {
      if (fs.existsSync(TJSC_FLAG) || Date.now() > deadline) {
        clearInterval(t);
        try {
          fs.rmSync(TJSC_FLAG, { force: true });
        } catch {
          /* best-effort */
        }
        resolve();
      }
    }, 1500);
  });
}

function validarInput(input: AnaliseCadastroInput): {
  locatario: DadosLocatario;
  lgpd: DadosLgpd;
  aprovado: boolean | undefined;
} {
  if (input.aprovar && input.reprovar) {
    throw new HttpError(400, "Use aprovar OU reprovar, não ambos");
  }
  if (!input.cpf) throw new HttpError(400, 'Campo "cpf" é obrigatório');
  if (!cpfValido(input.cpf)) throw new HttpError(400, `CPF inválido: ${input.cpf}`);
  if (!input.nome?.trim()) throw new HttpError(400, 'Campo "nome" é obrigatório');
  if (!input.nascimento) throw new HttpError(400, 'Campo "nascimento" é obrigatório');
  if (!dataValida(input.nascimento)) {
    throw new HttpError(400, `Data de nascimento inválida (use DD/MM/AAAA): ${input.nascimento}`);
  }
  if (!input.baseLegal?.trim()) {
    throw new HttpError(
      400,
      'Campo "baseLegal" é obrigatório (LGPD) — ex.: "consentimento do locatário"',
    );
  }

  const locatario: DadosLocatario = {
    cpf: cpfDigits(input.cpf),
    cpfFormatado: cpfFormatado(input.cpf),
    nome: input.nome.trim(),
    nascimento: input.nascimento.trim(),
    maeNome: input.maeNome?.trim() || null,
    paiNome: input.paiNome?.trim() || null,
    ufNascimento: input.ufNascimento?.trim() || null,
    municipioNascimento: input.municipioNascimento?.trim() || null,
    rg: input.rg?.trim() || null,
    orgaoExpedidor: input.orgaoExpedidor?.trim() || null,
    ufResidencia: input.ufResidencia?.trim() || null,
    municipioResidencia: input.municipioResidencia?.trim() || null,
    enderecoResidencia: input.enderecoResidencia?.trim() || null,
  };

  const lgpd: DadosLgpd = {
    baseLegal: input.baseLegal.trim(),
    titularConsentimento: (input.titular ?? input.nome).trim(),
    solicitante: input.solicitante ?? null,
    finalidade:
      input.finalidade?.trim() ||
      "Análise de cadastro de locatário (antecedentes criminais / processos) para análise de risco de locação.",
  };

  const aprovado: boolean | undefined = input.reprovar
    ? false
    : input.aprovar
      ? true
      : undefined;

  return { locatario, lgpd, aprovado };
}

export async function listarAnalisesCadastro(filtro?: { cpf?: string; comAlerta?: boolean }) {
  const items = await listarTriagensAsync({
    cpf: filtro?.cpf,
    comAlerta: filtro?.comAlerta,
  });
  return { total: items.length, items };
}

export async function obterAnaliseCadastro(idOuCpf: string): Promise<TriagemRegistro | null> {
  const key = idOuCpf.trim();
  const db = await loadTriagemDbAsync();
  const byId = db.triagens.find((t) => t.id === key);
  if (byId) return byId;
  const items = await listarTriagensAsync({ cpf: key });
  return items[0] ?? null;
}

export async function executarAnaliseCadastro(input: AnaliseCadastroInput) {
  const { locatario, lgpd, aprovado } = validarInput(input);
  const timeoutMin = input.timeoutMin ?? 6;
  const fontesSel: FonteId[] =
    input.fontes?.length ? input.fontes : ["bnmp", "pf", "tjsc"];

  let fontes: ResultadoFonte[];
  if (input.semBrowser) {
    fontes = fontesPendentes();
  } else {
    const precisaTjsc = fontesSel.includes("tjsc");
    fontes = await executarTriagem(locatario, {
      fontes: fontesSel,
      timeoutMin,
      aguardarFim: precisaTjsc ? () => aguardarFimTjsc(timeoutMin) : undefined,
      emailTjsc: input.emailResposta?.trim() || null,
      finalidadeTjsc: input.finalidade?.trim() || null,
      telefoneTjsc: input.telefone?.trim() || null,
    });
    fontes = mesclarFontes(caminhoBase(locatario.cpf, input.outDir), fontes);
  }

  const relatorio = montarRelatorio({ locatario, lgpd, fontes });
  const base = caminhoBase(locatario.cpf, input.outDir);
  const arquivos = gravarRelatorio(relatorio, base);

  let registro: TriagemRegistro | null = null;
  let acao: "novo" | "atualizado" | null = null;
  let cliente: ReturnType<typeof registrarAnaliseCadastroNoCliente> = null;
  let achados = 0;

  if (!input.semBrowser) {
    const r = await registrarTriagemAsync({
      locatario,
      relatorio,
      caminhoJson: arquivos.json,
      caminhoTxt: arquivos.txt,
      aprovado,
    });
    registro = r.registro;
    acao = r.acao;

    if (!input.semVinculo) {
      const alvo = (input.clienteId ?? locatario.cpf).trim();
      cliente = registrarAnaliseCadastroNoCliente(alvo, analiseClienteDeRegistro(registro));
    }

    const clienteIdAchados =
      cliente?.id ??
      (await loadClientesDbAsync()).clientes.find(
        (c) => c.cpf?.replace(/\D/g, "") === locatario.cpf,
      )?.id ??
      null;
    const linhas = registrarAchadosCliente({
      cpf: locatario.cpf,
      cpfFormatado: locatario.cpfFormatado,
      nome: locatario.nome,
      clienteId: clienteIdAchados,
      dataConsulta: registro.dataConsulta,
      analiseId: registro.id,
      fontes: relatorio.fontes,
    });
    achados = linhas.length;
  }

  return {
    relatorio,
    arquivos,
    registro,
    acao,
    cliente,
    achados,
    alertaGeral: relatorio.alertaGeral,
    resumo: relatorio.resumo,
  };
}

export async function registrarDecisaoAnalise(id: string, aprovado: boolean) {
  const db = await loadTriagemDbAsync();
  const idx = db.triagens.findIndex((t) => t.id === id);
  if (idx < 0) throw new HttpError(404, "Análise não encontrada");
  const t = db.triagens[idx]!;
  t.aprovado = aprovado;
  t.atualizadoEm = new Date().toISOString();
  db.triagens[idx] = t;
  await saveTriagemDbAsync(db);

  const cliente = registrarAnaliseCadastroNoCliente(t.cpf, analiseClienteDeRegistro(t));
  return { registro: t, cliente };
}

export type { RelatorioTriagem, TriagemRegistro };
