/**
 * Fonte BNMP — mandados de prisão / pessoas procuradas (CNJ), por NOME.
 *
 * Fluxo (Chrome real): abrimos a busca de peças do portal, o operador passa o
 * captcha e pesquisa pelo nome; capturamos a resposta JSON do endpoint
 * `/bnmpportal/api/pesquisa-pecas/filter` (ou `/pecas`) e normalizamos.
 *
 * Capturar a resposta (em vez de replicar payload/captcha/fingerprint no Node) é
 * robusto a mudanças de schema do portal. Ver `.cursor/tools/cnj-bnmp/`.
 */
import type { TriagemBrowser } from "./browser.js";
import { sleep } from "./browser.js";
import type { AchadoTriagem, DadosLocatario, ResultadoFonte } from "./tipos.js";

const PORTAL = "https://portalbnmp.cnj.jus.br/#/pesquisa-peca";
const ALVO_FILTER = "/bnmpportal/api/pesquisa-pecas/filter";
const ALVO_PECAS = "/bnmpportal/api/pesquisa-pecas/pecas";

/** Acentos fora + minúsculas, para comparação tolerante de nomes. */
function norm(s: string): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Acha o array de itens dentro do envelope (Spring Page ou variações). */
function autodetectarItens(raiz: unknown): any[] {
  if (Array.isArray(raiz)) return raiz;
  if (!raiz || typeof raiz !== "object") return [];
  const o = raiz as Record<string, any>;
  for (const k of [
    "content",
    "resultados",
    "itens",
    "dados",
    "items",
    "lista",
    "data",
    "registros",
    "pecas",
    "mandados",
    "result",
  ]) {
    if (Array.isArray(o[k])) return o[k];
  }
  const page = o.page;
  if (page && typeof page === "object") {
    for (const k of ["content", "items", "itens", "dados"]) {
      if (Array.isArray(page[k])) return page[k];
    }
  }
  for (const v of Object.values(o)) {
    if (Array.isArray(v) && v.length && typeof v[0] === "object") return v;
  }
  return [];
}

/** Procura recursivamente a 1ª string num objeto cujas chaves batam um padrão. */
function acharCampo(obj: any, padrao: RegExp, prof = 0): string | null {
  if (!obj || typeof obj !== "object" || prof > 4) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (padrao.test(k) && (typeof v === "string" || typeof v === "number")) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const r = acharCampo(v, padrao, prof + 1);
      if (r) return r;
    }
  }
  return null;
}

function itemParaAchado(item: any): AchadoTriagem {
  const nome = acharCampo(item, /nome/i) ?? "?";
  const tipoPeca =
    acharCampo(item, /tipoPeca|tipo_peca|tipoDocumento|descricaoPeca/i) ??
    "peça";
  const numeroPeca = acharCampo(item, /numeroPeca|numero_peca|numeroMandado/i);
  const numeroProcesso = acharCampo(item, /numeroProcesso|numero_processo/i);
  const orgao = acharCampo(item, /orgaoExpedidor|orgao|vara/i);
  const uf = acharCampo(item, /(^|\.)uf$|unidadeFederativa|siglaUf/i);
  const dataExp = acharCampo(item, /dataExpedicao|data_exp/i);
  const tipificacao = acharCampo(item, /tipificacao|tipoPenal|enquadramento/i);

  const partes = [
    numeroPeca ? `nº ${numeroPeca}` : null,
    numeroProcesso ? `proc. ${numeroProcesso}` : null,
    orgao ? `${orgao}` : null,
    uf ? `(${uf})` : null,
    dataExp ? `exp. ${dataExp}` : null,
  ].filter(Boolean);

  return {
    tipo: tipoPeca,
    descricao: `${nome} — ${tipoPeca}${partes.length ? " · " + partes.join(" · ") : ""}${
      tipificacao ? ` · ${tipificacao}` : ""
    }`,
    detalhes: {
      nome,
      tipoPeca,
      numeroPeca,
      numeroProcesso,
      orgao,
      uf,
      dataExpedicao: dataExp,
      tipificacao,
    },
  };
}

const agora = (): string => new Date().toISOString();

interface ResultadoFill {
  ok: boolean;
  campo?: string;
  valor?: string;
  motivo?: string;
  nInputs?: number;
}

/**
 * Preenche o campo de nome na tela de busca do BNMP de forma heurística (o DOM
 * fica atrás do captcha, então não fixamos seletor): escolhe o input de texto
 * visível que melhor casa com "nome" e define o valor via setter nativo.
 */
async function preencherNomeBnmp(
  browser: TriagemBrowser,
  sid: string,
  nome: string,
): Promise<ResultadoFill> {
  const expr = `(() => {
    const visivel = el => !!(el.offsetParent || el.getClientRects().length);
    const inputs = Array.from(document.querySelectorAll('input')).filter(i => {
      const t = (i.type || 'text').toLowerCase();
      return (t === 'text' || t === 'search') && visivel(i) && i.id !== 'g-recaptcha-response';
    });
    if (!inputs.length) return { ok: false, motivo: 'sem input de texto visível' };
    const score = i => {
      const s = ((i.getAttribute('formcontrolname') || '') + ' ' + (i.getAttribute('placeholder') || '') + ' ' + (i.getAttribute('aria-label') || '') + ' ' + (i.name || '')).toLowerCase();
      if (/nome/.test(s)) return 2;
      if (/(processo|peca|peça|documento|cpf|n[uú]mero|orgao|órgão)/.test(s)) return -1;
      return 0;
    };
    inputs.sort((a, b) => score(b) - score(a));
    const alvo = inputs[0];
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    alvo.focus();
    setter.call(alvo, ${JSON.stringify(nome)});
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
    alvo.dispatchEvent(new Event('change', { bubbles: true }));
    alvo.dispatchEvent(new Event('blur', { bubbles: true }));
    return {
      ok: true,
      campo: alvo.getAttribute('formcontrolname') || alvo.getAttribute('placeholder') || alvo.getAttribute('aria-label') || alvo.name || '?',
      valor: alvo.value,
      nInputs: inputs.length,
    };
  })()`;
  return (
    (await browser.avaliar<ResultadoFill>(expr, sid).catch((e) => ({
      ok: false,
      motivo: e instanceof Error ? e.message : String(e),
    }))) ?? { ok: false, motivo: "sem retorno" }
  );
}

/**
 * Consulta o BNMP por nome no Chrome real (operador resolve captcha + pesquisa).
 * @param timeoutMs janela para o operador pesquisar e capturarmos a resposta.
 */
export async function consultarBnmp(
  browser: TriagemBrowser,
  locatario: DadosLocatario,
  opts: { timeoutMs?: number; prompt?: (msg: string) => void } = {},
): Promise<ResultadoFonte> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const log = opts.prompt ?? ((m: string) => console.log(m));

  const base: ResultadoFonte = {
    id: "bnmp",
    nome: "CNJ BNMP — mandados de prisão / procurados",
    status: "pendente",
    alerta: false,
    observacao: "",
    achados: [],
    consultadoEm: agora(),
  };

  browser.capturarRespostas([ALVO_FILTER, ALVO_PECAS]);
  browser.limparCapturas();

  let sid: string;
  try {
    sid = await browser.novaAba(PORTAL);
  } catch (e) {
    return {
      ...base,
      status: "erro",
      observacao: `Não consegui abrir o portal BNMP: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Fecha a aba do BNMP assim que terminamos (captcha resolvido + capturado, ou
  // erro/tempo esgotado) — o resultado já está em mãos, a janela não fica aberta.
  try {
    log("");
    log("== BNMP (CNJ) ==");
    log(">> Na aba do BNMP, RESOLVA APENAS o reCAPTCHA.");
    log("   Quando a tela de busca abrir, eu preencho o nome e clico em Pesquisar sozinho.");
    log(`(aguardando até ${Math.round(timeoutMs / 60000)} min)`);

    // O portal redireciona p/ #/captcha/ até o reCAPTCHA ser resolvido; depois
    // volta p/ a busca. Esperamos a tela de busca (input de texto visível).
    const TELA_BUSCA = `(!location.hash.toLowerCase().includes('captcha') && Array.from(document.querySelectorAll('input')).some(i => ((i.type||'text')==='text' || i.type==='search') && (i.offsetParent||i.getClientRects().length) && i.id!=='g-recaptcha-response'))`;
    const chegou = await browser.esperarCondicao(sid, TELA_BUSCA, timeoutMs, 1500);
    if (chegou) {
      await browser.reinjetarHook(sid);
      await sleep(800);
      const r = await preencherNomeBnmp(browser, sid, locatario.nome);
      log(
        r.ok
          ? `Nome preenchido no campo "${r.campo}" (valor: "${r.valor}") — clicando em Pesquisar...`
          : `Não localizei o campo de nome automaticamente (${r.motivo ?? "?"}). Pesquise pelo nome manualmente, por favor.`,
      );
      // Pequena espera p/ o Angular validar e habilitar o botão antes do clique.
      await sleep(600);
      const btn = await browser.clicarTexto(sid, ["Pesquisar", "Buscar", "Consultar"]);
      if (btn) log(`Cliquei em "${btn}".`);
      else log("Não achei o botão Pesquisar — clique você, por favor.");
    }

    const resp = await browser.esperarResposta(ALVO_FILTER, timeoutMs).then(
      (r) => r ?? browser.respostasCapturadas(ALVO_PECAS)[0] ?? null,
    );

    if (!resp) {
      return {
        ...base,
        status: "erro",
        consultadoEm: agora(),
        observacao:
          "Não capturei a resposta da busca do BNMP (captcha não resolvido, sem pesquisa, ou tempo esgotado).",
      };
    }

    let json: unknown;
    try {
      json = JSON.parse(resp.body);
    } catch {
      return {
        ...base,
        status: "erro",
        consultadoEm: agora(),
        observacao: "Resposta do BNMP não veio em JSON reconhecível.",
      };
    }

    const itens = autodetectarItens(json);
    const alvoNome = norm(locatario.nome);
    const achados = itens.map(itemParaAchado);
    // Match exato de nome ganha destaque; o resto entra como possível homônimo.
    const exatos = achados.filter(
      (a) => norm(String(a.detalhes?.nome ?? "")) === alvoNome,
    );

    if (itens.length === 0) {
      return {
        ...base,
        status: "ok",
        alerta: false,
        consultadoEm: agora(),
        observacao: `Nenhuma peça encontrada para "${locatario.nome}" no BNMP.`,
        achados: [],
      };
    }

    const obs =
      `${itens.length} peça(s) retornada(s) para a busca por nome` +
      (exatos.length
        ? `; ${exatos.length} com nome idêntico.`
        : "; nenhuma com nome idêntico (provável homônimo — conferir CPF/nascimento).");

    return {
      ...base,
      status: "ok",
      alerta: itens.length > 0,
      consultadoEm: agora(),
      observacao: `${obs} ATENÇÃO: confira CPF/data de nascimento (homônimos).`,
      achados,
    };
  } finally {
    log("Fechando a aba do BNMP...");
    await browser.fecharAba(sid);
  }
}
