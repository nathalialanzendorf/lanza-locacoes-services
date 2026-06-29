/**
 * Fonte PF SINIC — Certidão de Antecedentes Criminais (nacional), por CPF.
 *
 * Fluxo (Chrome real): abrimos a emissão da CAC; o operador preenche os dados +
 * resolve o reCAPTCHA + emite. O resultado é um PDF baixado — capturamos o
 * download e fazemos parse do texto (`NADA CONSTA` vs protocolo/consta).
 *
 * Ver `.cursor/tools/pf-antecedentes/`.
 */
import fs from "node:fs";
import path from "node:path";

import pdfParse from "pdf-parse";

import { REPO_ROOT } from "../repoRoot.js";
import type { TriagemBrowser } from "./browser.js";
import { sleep } from "./browser.js";
import type { DadosLocatario, ResultadoFonte } from "./tipos.js";

// Seletores do formulário de emissão da CAC (Angular + PrimeNG).
const SEL = {
  cpf: "input.p-inputmask",
  nome: 'input[formcontrolname="nome"]',
  nascimento: 'pf-calendar[formcontrolname="dtNascimento"] input',
  mae: 'input[formcontrolname="nomeMae"]',
  pai: 'input[formcontrolname="nomePai"]',
} as const;

const PORTAL = "https://servicos.pf.gov.br/epol-sinic-publico/";

const agora = (): string => new Date().toISOString();

function norm(s: string): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Classifica o texto do PDF da CAC. */
export function classificarCac(texto: string): {
  alerta: boolean;
  resumo: string;
} {
  const t = norm(texto);
  // Certidão limpa: "NADA CONSTA" ou "NÃO CONSTA condenação com trânsito em
  // julgado" (após norm: "nao consta..."). Ambas significam sem condenação.
  if (/nada\s+consta/.test(t) || /n[ãa]o\s+consta\s+condena/.test(t) || /nao\s+consta\s+condena/.test(t)) {
    return { alerta: false, resumo: "NADA CONSTA (sem condenação com trânsito em julgado)." };
  }
  // PF não emite "consta" online: gera protocolo p/ atendimento presencial.
  if (/(protocolo|compare[cç]a|unidade da pol[ií]cia|presencial)/.test(t)) {
    return {
      alerta: true,
      resumo:
        "Gerou PROTOCOLO (registro/homônimo/divergência) — verificar presencialmente na PF.",
    };
  }
  if (/consta/.test(t)) {
    return { alerta: true, resumo: 'Documento menciona "consta" — revisar manualmente.' };
  }
  return {
    alerta: false,
    resumo: "PDF emitido (texto não reconhecido automaticamente — revisar o arquivo).",
  };
}

/**
 * Consulta o PF SINIC no Chrome real (operador preenche + resolve reCAPTCHA).
 */
export async function consultarPfSinic(
  browser: TriagemBrowser,
  locatario: DadosLocatario,
  opts: { timeoutMs?: number; prompt?: (msg: string) => void } = {},
): Promise<ResultadoFonte> {
  const timeoutMs = opts.timeoutMs ?? 6 * 60 * 1000;
  const log = opts.prompt ?? ((m: string) => console.log(m));

  const base: ResultadoFonte = {
    id: "pf-sinic",
    nome: "PF SINIC — certidão de antecedentes criminais (nacional)",
    status: "pendente",
    alerta: false,
    observacao: "",
    achados: [],
    evidencia: null,
    consultadoEm: agora(),
  };

  let sid: string;
  try {
    sid = await browser.novaAba(PORTAL);
  } catch (e) {
    const msg = `Não consegui abrir o portal da PF: ${e instanceof Error ? e.message : String(e)}`;
    log("");
    log(`== PF — Antecedentes Criminais (SINIC) ==\n${msg}`);
    return { ...base, status: "erro", observacao: msg };
  }

  // Fecha a aba da PF assim que o PDF é capturado (ou em erro/tempo esgotado) —
  // o arquivo já está salvo em disco, não precisa manter a janela aberta.
  try {
    log("");
    log("== PF — Antecedentes Criminais (SINIC) ==");

    // Aguarda a SPA renderizar e preenche — com RETENTATIVA: em paralelo, a aba
    // pode renderizar devagar, então re-preenchemos até o nome/CPF "colarem"
    // (em vez de preencher uma única vez e seguir com campos vazios).
    log("Preenchendo os dados do locatário na PF...");
    await sleep(3000);
    let lidos = { cpf: "", nome: "", nascimento: "", mae: "" };
    for (let i = 0; i < 8; i++) {
      await browser.reinjetarHook(sid).catch(() => {});
      const temForm = await browser.esperarCondicao(
        sid,
        `document.querySelector(${JSON.stringify(SEL.nome)})`,
        15000,
        1000,
      );
      if (!temForm) {
        if (!(await browser.vivo())) break;
        await sleep(1500);
        continue;
      }
      await browser.digitar(sid, SEL.cpf, locatario.cpf); // máscara formata os dígitos
      await browser.preencher(sid, SEL.nome, locatario.nome);
      // O pf-calendar ignora value setado por JS — precisa de teclado real (CDP),
      // só dígitos (o componente formata para DD/MM/AAAA).
      await browser.digitarTeclado(sid, SEL.nascimento, locatario.nascimento.replace(/\D/g, ""));
      if (locatario.maeNome) await browser.preencher(sid, SEL.mae, locatario.maeNome);
      if (locatario.paiNome) await browser.preencher(sid, SEL.pai, locatario.paiNome);

      lidos = {
        cpf: (await browser.valorDe(sid, SEL.cpf)) ?? "",
        nome: (await browser.valorDe(sid, SEL.nome)) ?? "",
        nascimento: (await browser.valorDe(sid, SEL.nascimento)) ?? "",
        mae: (await browser.valorDe(sid, SEL.mae)) ?? "",
      };
      if (lidos.nome && lidos.cpf) break;
      await sleep(1500);
    }
    log(
      `Campos preenchidos → CPF: "${lidos.cpf}" | Nome: "${lidos.nome}" | ` +
        `Nasc.: "${lidos.nascimento}" | Mãe: "${lidos.mae}"`,
    );
    log("");
    log(">> Na aba da PF, RESOLVA APENAS o reCAPTCHA ('Não sou robô').");
    log("   Eu clico em Emitir CAC repetidamente (independe da detecção do captcha); o PDF é capturado sozinho.");
    log("   (Se algum campo ficou em branco, ajuste só ele.)");
    log(`(aguardando até ${Math.round(timeoutMs / 60000)} min)`);

    // Clique PERSISTENTE: clicamos em "Emitir CAC" a cada ciclo, INDEPENDENTE de
    // detectarmos o token do reCAPTCHA (a detecção via grecaptcha/textarea nem
    // sempre é visível nesta página). Cliques antes de o operador resolver o
    // captcha são inócuos (o site só valida); assim que o captcha vale, o clique
    // emite e capturamos o download — sem depender de recaptchaResolvido().
    let dl: Awaited<ReturnType<typeof browser.esperarDownload>> = null;
    let tentativas = 0;
    let avisouClique = false;
    const ate = Date.now() + timeoutMs;
    while (Date.now() < ate) {
      dl = await browser.esperarDownload(2500);
      if (dl) break;
      if (!(await browser.vivo())) break;
      await browser.reinjetarHook(sid).catch(() => {});
      const alvo = await browser.clicarTexto(sid, ["Emitir CAC", "Emitir"]);
      if (alvo) {
        tentativas++;
        if (!avisouClique) {
          log(`Clicando em "${alvo}" (re-tento até o PDF ser gerado — resolva o reCAPTCHA se o site pedir).`);
          avisouClique = true;
        }
      }
    }
    if (dl) log(`PDF da PF capturado (após ${tentativas} clique(s) em Emitir).`);

    if (!dl || !dl.caminho || !fs.existsSync(dl.caminho)) {
      return {
        ...base,
        status: "erro",
        consultadoEm: agora(),
        observacao:
          "Não capturei o PDF da certidão (reCAPTCHA não resolvido, emissão não concluída, ou tempo esgotado).",
      };
    }

    // Renomeia para um nome legível (evidência datada).
    const destino = path.join(
      browser.downloadDir,
      `pf-cac-${locatario.cpf}-${new Date().toISOString().slice(0, 10)}.pdf`,
    );
    try {
      fs.copyFileSync(dl.caminho, destino);
    } catch {
      /* mantém o original se a cópia falhar */
    }
    const arquivoFinal = fs.existsSync(destino) ? destino : dl.caminho;

    let texto = "";
    try {
      const buf = fs.readFileSync(arquivoFinal);
      const parsed = await pdfParse(buf);
      texto = parsed.text ?? "";
    } catch (e) {
      return {
        ...base,
        status: "erro",
        consultadoEm: agora(),
        evidencia: path.relative(REPO_ROOT, arquivoFinal),
        observacao: `PDF capturado mas falhou o parse: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const { alerta, resumo } = classificarCac(texto);
    return {
      ...base,
      status: "ok",
      alerta,
      consultadoEm: agora(),
      evidencia: path.relative(REPO_ROOT, arquivoFinal),
      observacao: resumo,
      achados: alerta
        ? [{ tipo: "antecedente", descricao: resumo }]
        : [],
    };
  } finally {
    log("Fechando a aba da PF...");
    await browser.fecharAba(sid);
  }
}
