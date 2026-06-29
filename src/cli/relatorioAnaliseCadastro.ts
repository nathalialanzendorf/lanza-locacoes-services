import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

import { REPO_ROOT } from "../lib/repoRoot.js";
import { executarTriagem, type FonteId } from "../lib/analiseCadastro/index.js";
import {
  caminhoBase,
  gravarRelatorio,
  montarRelatorio,
  type DadosLgpd,
} from "../lib/analiseCadastro/relatorio.js";
import { listarTriagens, registrarTriagem } from "../lib/analiseCadastro/triagemDb.js";
import { registrarAchadosCliente } from "../lib/analiseCadastro/clienteAnaliseDb.js";
import type { DadosLocatario, ResultadoFonte } from "../lib/analiseCadastro/tipos.js";
import {
  analiseClienteDeRegistro,
  findClienteByCpf,
  registrarAnaliseCadastroNoCliente,
  type ClienteRegistro,
} from "../lib/clientesDb.js";

/**
 * Relatório de análise de cadastro (locatário) — antecedentes criminais /
 * processos em fontes públicas gratuitas (CNJ BNMP, PF SINIC, TJSC), via Chrome
 * real (o operador resolve captcha/login). Antecedentes são dados sensíveis de
 * terceiros: é OBRIGATÓRIO registrar a base legal (LGPD) antes de rodar.
 */

const HELP = `relatorio-analise-cadastro --cpf CPF --nome "NOME" --nascimento DD/MM/AAAA --base-legal "TEXTO" [opções]

  Análise de cadastro (antecedentes criminais / processos) de um locatário a
  partir de fontes públicas gratuitas. Antecedentes são dados sensíveis de
  terceiros: é OBRIGATÓRIO registrar a base legal (LGPD) antes de rodar.

  Obrigatórios:
    --cpf CPF                  CPF do locatário (com ou sem pontuação)
    --nome "NOME COMPLETO"     Nome civil completo
    --nascimento DD/MM/AAAA    Data de nascimento
    --base-legal "TEXTO"       Base legal LGPD (ex.: "consentimento do locatário")

  Fontes (default: todas):
    --bnmp                     Só CNJ BNMP (mandados/procurados, por nome)
    --pf                       Só PF SINIC (antecedentes nacionais, por CPF)
    --tjsc                     Só TJSC (certidão criminal estadual — assistido)
    (combináveis; sem nenhuma destas, roda as três)

  Opcionais:
    --mae "NOME"               Nome da mãe (filiação) — a PF usa p/ refinar
    --pai "NOME"               Nome do pai (filiação)
    --uf-nascimento UF         UF de nascimento (ex.: SC)
    --municipio-nascimento M   Município de nascimento (ex.: Imbituba)
    --rg NUMERO                RG (da CNH) — TJSC pede na requisição
    --orgao-expedidor "X"      Órgão expedidor do RG (ex.: SSP SC)
    --uf-residencia UF         UF de residência (do comprovante; ex.: SC)
    --municipio-residencia M   Município de residência (TJSC EXIGE; ex.: Imbituba)
    --endereco-residencia "X"  Rua/nº/bairro/CEP (do comprovante de endereço)
    --email-resposta EMAIL     TJSC: e-mail que recebe a certidão (requisição)
    --telefone NUMERO          TJSC: telefone de contato (default: Lanza Locações)
    --finalidade "TEXTO"       TJSC: finalidade da requisição (default locação)
    --titular "NOME"           Quem consentiu (default: o próprio locatário)
    --solicitante "NOME"       Operador que faz a análise de cadastro
    --aprovar                  Marca a decisão como APROVADO (passou na análise)
    --reprovar                 Marca a decisão como REPROVADO (não passou)
    --cliente <id|cpf>         Cliente a vincular (default: o CPF da análise)
    --sem-vinculo              Não espelhar o resultado no cliente (clientes.json)
    --timeout-min N            Minutos de espera por fonte (default 6)
    --sem-browser              Não abre o Chrome; gera só o relatório-esqueleto
    --out CAMINHO              Base de saída (default: relatorios/_tmp/analise-cadastro/<cpf>-<data>)
    --json                     Imprime o relatório (JSON) no stdout
    -h, --help                 Mostra esta ajuda

  Histórico (database/analise-cadastro.json):
    --listar [--cpf CPF] [--com-alerta] [--json]
                               Lista análises já gravadas (não consulta nada)

Exemplo:
  npx tsx src/run.ts relatorio-analise-cadastro \\
    --cpf 123.456.789-09 --nome "Fulano de Tal" --nascimento 31/12/1990 \\
    --base-legal "consentimento do locatário" --titular "Fulano de Tal"

Saída (convenção do projeto: .txt + .json + canvas):
  relatorios/_tmp/analise-cadastro/<cpf>-<AAAA-MM-DD>.txt   (documento legível)
  relatorios/_tmp/analise-cadastro/<cpf>-<AAAA-MM-DD>.json  (sidecar p/ canvas)
  + canvas .canvas.tsx (passo do agente — ver a skill)`;

function opt(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function cpfDigits(cpf: string): string {
  return String(cpf ?? "").replace(/\D/g, "");
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
  const dv1 = calc(d.slice(0, 9), 10);
  const dv2 = calc(d.slice(0, 10), 11);
  return dv1 === Number(d[9]) && dv2 === Number(d[10]);
}

function cpfFormatado(cpf: string): string {
  const d = cpfDigits(cpf);
  return d.length === 11
    ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    : cpf;
}

function dataValida(s: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? "").trim());
  if (!m) return false;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  const dt = new Date(ano, mes - 1, dia);
  if (dt.getFullYear() !== ano || dt.getMonth() !== mes - 1 || dt.getDate() !== dia) {
    return false;
  }
  if (dt.getTime() > Date.now()) return false;
  if (ano < 1900) return false;
  return true;
}

function fontesSelecionadas(argv: string[]): FonteId[] {
  const sel: FonteId[] = [];
  if (argv.includes("--bnmp")) sel.push("bnmp");
  if (argv.includes("--pf")) sel.push("pf");
  if (argv.includes("--tjsc")) sel.push("tjsc");
  return sel.length ? sel : ["bnmp", "pf", "tjsc"];
}

function aguardarEnter(msg: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(msg, () => {
      rl.close();
      resolve();
    });
  });
}

/** Arquivo-sinalizador para encerrar o passo assistido do TJSC em background. */
const TJSC_FLAG = path.join(REPO_ROOT, "relatorios", "_tmp", "analise-cadastro", "tjsc-done.flag");

/**
 * Espera o fim do passo assistido do TJSC antes de fechar o Chrome.
 * - Terminal interativo (TTY): pede Enter ao operador.
 * - Em background (sem TTY): aguarda o arquivo-sinalizador `TJSC_FLAG` (que o
 *   operador/assistente cria ao terminar) ou um timeout, para não travar.
 */
function aguardarFimTjsc(timeoutMin: number): Promise<void> {
  if (process.stdin.isTTY) {
    return aguardarEnter("\nConcluiu o passo do TJSC? Pressione Enter para fechar o Chrome...");
  }
  try {
    fs.mkdirSync(path.dirname(TJSC_FLAG), { recursive: true });
    fs.rmSync(TJSC_FLAG, { force: true });
  } catch {
    /* best-effort */
  }
  console.log(
    `\n[background] TJSC assistido: faça o login gov.br + requisição. Ao terminar, crie o arquivo:\n  ${TJSC_FLAG}\n(ou aguarde até ${timeoutMin} min para fechar automaticamente).`,
  );
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

/**
 * Mescla as fontes recém-consultadas com as do relatório do MESMO dia (se houver):
 * fontes novas substituem as de mesmo `id`; as não reexecutadas são preservadas.
 * Permite rodar só `--pf`/`--tjsc` depois sem perder o BNMP já capturado.
 */
function mesclarFontes(base: string, novas: ResultadoFonte[]): ResultadoFonte[] {
  let anteriores: ResultadoFonte[] = [];
  const arq = `${base}.json`;
  try {
    if (fs.existsSync(arq)) {
      const r = JSON.parse(fs.readFileSync(arq, "utf8")) as { fontes?: ResultadoFonte[] };
      if (Array.isArray(r.fontes)) anteriores = r.fontes;
    }
  } catch {
    /* relatório anterior ilegível — ignora e usa só as novas */
  }
  const porId = new Map<string, ResultadoFonte>();
  for (const f of anteriores) porId.set(f.id, f);
  for (const f of novas) porId.set(f.id, f);
  const ordem = ["bnmp", "pf-sinic", "tjsc"];
  return [...porId.values()].sort(
    (a, b) =>
      (ordem.indexOf(a.id) + 1 || 99) - (ordem.indexOf(b.id) + 1 || 99),
  );
}

/** Esqueleto: fontes como "pendente" (modo --sem-browser). */
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

export async function main(argv: string[]): Promise<void> {
  if (!argv.length || argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  // Consulta do histórico gravado (não roda análise, não exige base legal).
  if (argv.includes("--listar")) {
    const registros = listarTriagens({
      cpf: opt(argv, "--cpf") ?? undefined,
      comAlerta: argv.includes("--com-alerta"),
    });
    if (argv.includes("--json")) {
      console.log(JSON.stringify(registros, null, 2));
      return;
    }
    if (!registros.length) {
      console.log("Nenhuma análise de cadastro no histórico (database/analise-cadastro.json).");
      return;
    }
    console.log(`Histórico de análises de cadastro (${registros.length}):\n`);
    for (const t of registros) {
      const tag = t.alertaGeral ? "ATENÇÃO" : "ok";
      const dec =
        t.aprovado === true ? " APROVADO" : t.aprovado === false ? " REPROVADO" : " pendente";
      console.log(`  ${t.dataConsulta} | [${tag}]${dec} | ${t.nome} (${t.cpfFormatado})`);
      console.log(`    ${t.resumo}`);
      if (t.relatorioTxt) console.log(`    relatório: ${t.relatorioTxt}`);
    }
    return;
  }

  const cpf = opt(argv, "--cpf") ?? "";
  const nome = opt(argv, "--nome") ?? "";
  const nascimento = opt(argv, "--nascimento") ?? "";
  const baseLegal = opt(argv, "--base-legal") ?? "";
  const titular = opt(argv, "--titular") ?? nome;
  const solicitante = opt(argv, "--solicitante") ?? null;
  const semBrowser = argv.includes("--sem-browser");
  const timeoutMin = Number(opt(argv, "--timeout-min")) || 6;
  // Decisão do operador: passou na análise? undefined = não decidir agora (pendente).
  const aprovado: boolean | undefined = argv.includes("--reprovar")
    ? false
    : argv.includes("--aprovar")
      ? true
      : undefined;

  const erros: string[] = [];
  if (argv.includes("--aprovar") && argv.includes("--reprovar"))
    erros.push("Use --aprovar OU --reprovar, não ambos.");
  if (!cpf) erros.push("--cpf é obrigatório.");
  else if (!cpfValido(cpf)) erros.push(`CPF inválido: ${cpf}`);
  if (!nome.trim()) erros.push("--nome é obrigatório.");
  if (!nascimento) erros.push("--nascimento é obrigatório.");
  else if (!dataValida(nascimento))
    erros.push(`Data de nascimento inválida (use DD/MM/AAAA): ${nascimento}`);
  if (!baseLegal.trim()) {
    erros.push(
      "--base-legal é OBRIGATÓRIO (LGPD): registre a base legal da consulta " +
        '(ex.: "consentimento do locatário") antes de fazer a análise de cadastro.',
    );
  }

  if (erros.length) {
    console.error("Não foi possível iniciar a análise de cadastro:\n");
    for (const e of erros) console.error(`  • ${e}`);
    console.error("\n" + HELP);
    process.exit(1);
  }

  const locatario: DadosLocatario = {
    cpf: cpfDigits(cpf),
    cpfFormatado: cpfFormatado(cpf),
    nome: nome.trim(),
    nascimento: nascimento.trim(),
    maeNome: opt(argv, "--mae")?.trim() || null,
    paiNome: opt(argv, "--pai")?.trim() || null,
    ufNascimento: opt(argv, "--uf-nascimento")?.trim() || null,
    municipioNascimento: opt(argv, "--municipio-nascimento")?.trim() || null,
    rg: opt(argv, "--rg")?.trim() || null,
    orgaoExpedidor: opt(argv, "--orgao-expedidor")?.trim() || null,
    ufResidencia: opt(argv, "--uf-residencia")?.trim() || null,
    municipioResidencia: opt(argv, "--municipio-residencia")?.trim() || null,
    enderecoResidencia: opt(argv, "--endereco-residencia")?.trim() || null,
  };
  const lgpd: DadosLgpd = {
    baseLegal: baseLegal.trim(),
    titularConsentimento: titular.trim(),
    solicitante,
    finalidade:
      "Análise de cadastro de locatário (antecedentes criminais / processos) para análise de risco de locação.",
  };

  console.log(`Análise de cadastro para ${locatario.nome} (${locatario.cpfFormatado}).`);
  console.log(`  Base legal (LGPD): ${lgpd.baseLegal}`);
  console.log(`  Titular do consentimento: ${lgpd.titularConsentimento}`);

  let fontes: ResultadoFonte[];
  if (semBrowser) {
    console.log("\nModo --sem-browser: gerando só o relatório-esqueleto (fontes pendentes).");
    fontes = fontesPendentes();
  } else {
    const sel = fontesSelecionadas(argv);
    console.log(`  Fontes: ${sel.join(", ")} | timeout ${timeoutMin} min/fonte`);
    const precisaEnter = sel.includes("tjsc");
    fontes = await executarTriagem(locatario, {
      fontes: sel,
      timeoutMin,
      prompt: (m) => console.log(m),
      aguardarFim: precisaEnter ? () => aguardarFimTjsc(timeoutMin) : undefined,
      emailTjsc: opt(argv, "--email-resposta")?.trim() || null,
      finalidadeTjsc: opt(argv, "--finalidade")?.trim() || null,
      telefoneTjsc: opt(argv, "--telefone")?.trim() || null,
    });
    // Preserva fontes do mesmo dia não reexecutadas (ex.: rodar só --pf depois
    // mantém o BNMP capturado antes).
    fontes = mesclarFontes(caminhoBase(locatario.cpf, opt(argv, "--out")), fontes);
  }

  const relatorio = montarRelatorio({ locatario, lgpd, fontes });
  const base = caminhoBase(locatario.cpf, opt(argv, "--out"));
  const { json, txt } = gravarRelatorio(relatorio, base);

  // Grava no histórico (database/analise-cadastro.json) — exceto no esqueleto, que não
  // é uma consulta real. Idempotente por cpf+data (re-run no dia atualiza).
  let dbInfo = "";
  let clienteInfo = "";
  let achadosInfo = "";
  let inativacaoInfo = "";
  if (!semBrowser) {
    const { registro, acao } = registrarTriagem({
      locatario,
      relatorio,
      caminhoJson: json,
      caminhoTxt: txt,
      aprovado,
    });
    dbInfo = `Histórico:  database/analise-cadastro.json (${acao}, id ${registro.id})`;

    // Espelha o resultado no cliente cadastrado (coluna analiseCadastro), se existir.
    let vinculado: ClienteRegistro | null = null;
    if (!argv.includes("--sem-vinculo")) {
      const alvoCliente = (opt(argv, "--cliente") ?? locatario.cpf).trim();
      vinculado = registrarAnaliseCadastroNoCliente(alvoCliente, analiseClienteDeRegistro(registro));
      const dec =
        registro.aprovado === true
          ? "APROVADO"
          : registro.aprovado === false
            ? "REPROVADO"
            : "pendente";
      clienteInfo = vinculado
        ? `Cliente:    ${vinculado.nome} — análise de cadastro: ${dec} (${registro.dataConsulta})`
        : "Cliente:    CPF não cadastrado — registre com a skill cadastro-cliente (a análise será herdada automaticamente).";
      if (vinculado && registro.aprovado === false && vinculado.ativo === false) {
        inativacaoInfo = `            ⚠ cliente INATIVADO (reprovado na análise de cadastro).`;
      }
    }

    // Tabela de achados por cliente×site×data (database/cliente-analise.json).
    const clienteIdAchados = vinculado?.id ?? findClienteByCpf(locatario.cpf)?.id ?? null;
    const linhas = registrarAchadosCliente({
      cpf: locatario.cpf,
      cpfFormatado: locatario.cpfFormatado,
      nome: locatario.nome,
      clienteId: clienteIdAchados,
      dataConsulta: registro.dataConsulta,
      analiseId: registro.id,
      fontes: relatorio.fontes,
    });
    achadosInfo = `Achados:    database/cliente-analise.json (${linhas.length} linha(s) — fonte×data)`;
  }

  if (argv.includes("--json")) console.log(JSON.stringify(relatorio, null, 2));

  console.log("");
  console.log(relatorio.alertaGeral ? "RESULTADO: ATENÇÃO (há alerta)." : "RESULTADO: sem alertas automáticos.");
  console.log(`  ${relatorio.resumo}`);
  for (const f of relatorio.fontes) {
    const tag = f.status === "ok" ? (f.alerta ? "ALERTA" : "OK") : f.status.toUpperCase();
    console.log(`  • [${tag}] ${f.nome} — ${f.observacao}`);
  }
  console.log("");
  console.log(`Documento: ${path.relative(REPO_ROOT, txt)}`);
  console.log(`Sidecar:   ${path.relative(REPO_ROOT, json)} (dados p/ canvas)`);
  if (dbInfo) console.log(dbInfo);
  if (achadosInfo) console.log(achadosInfo);
  if (clienteInfo) console.log(clienteInfo);
  if (inativacaoInfo) console.log(inativacaoInfo);
}
