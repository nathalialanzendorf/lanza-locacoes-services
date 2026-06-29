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
import type { RespostaCapturada, TriagemBrowser } from "./browser.js";
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

interface ResultadoFillBnmp {
  nome: boolean;
  cpf: boolean;
  mae: boolean;
  pai: boolean;
  nascimento: boolean;
}

/**
 * Preenche TODOS os campos úteis da busca avançada do BNMP por seletor exato
 * (mapeado ao vivo do formulário `#/pesquisa-peca`):
 *   - nome        → `input[name="nomePessoa"]`
 *   - CPF         → `input[name="numeroCpf"]` (mascarado → digitação)
 *   - nascimento  → `input[name="dataNascimento"]` (mascarado → digitação)
 *   - mãe e pai   → ambos `input[name="nomeMae"]`; índice 0 = mãe, 1 = pai
 *
 * Preencher CPF + filiação + nascimento (e não só o nome) estreita a busca por
 * nome e elimina homônimos — era o que faltava no preenchimento anterior.
 */
async function preencherCamposBnmp(
  browser: TriagemBrowser,
  sid: string,
  d: DadosLocatario,
): Promise<ResultadoFillBnmp> {
  const nome = await browser.preencher(sid, 'input[name="nomePessoa"]', d.nome);

  // Mãe e pai dividem name="nomeMae" (a 2ª ocorrência é "Nome do Pai") — não dá
  // para usar querySelector simples, então preenchemos por índice via setter.
  const filiacao = await browser
    .avaliar<{ mae: boolean; pai: boolean }>(
      `(() => {
        const setNativo = (el, v) => {
          try {
            const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
            desc.set.call(el, v);
          } catch (e) { el.value = v; }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new Event('blur', { bubbles: true }));
        };
        const xs = Array.from(document.querySelectorAll('input[name="nomeMae"]'));
        const mae = ${JSON.stringify(d.maeNome ?? "")};
        const pai = ${JSON.stringify(d.paiNome ?? "")};
        const r = { mae: false, pai: false };
        if (xs[0] && mae) { xs[0].focus(); setNativo(xs[0], mae); r.mae = true; }
        if (xs[1] && pai) { xs[1].focus(); setNativo(xs[1], pai); r.pai = true; }
        return r;
      })()`,
      sid,
    )
    .catch(() => ({ mae: false, pai: false }));

  const soDigitos = (s: string): string => s.replace(/\D/g, "");
  // Campos PrimeNG p-inputmask: digitação tecla-a-tecla (o hook limpa antes, então
  // re-chamar no laço é idempotente). A máscara formata os dígitos.
  const cpf = d.cpf
    ? await browser.digitar(sid, 'input[name="numeroCpf"]', soDigitos(d.cpf))
    : false;
  const nascimento = d.nascimento
    ? await browser.digitar(sid, 'input[name="dataNascimento"]', soDigitos(d.nascimento))
    : false;

  return { nome, cpf, mae: filiacao.mae, pai: filiacao.pai, nascimento };
}

/**
 * Dispara a busca também via tecla Enter no campo de nome — algumas versões do
 * portal submetem no Enter, então combinamos isto com o clique no botão para
 * cobrir os dois caminhos sem depender de clique manual do operador.
 */
async function enviarEnterBnmp(browser: TriagemBrowser, sid: string): Promise<void> {
  const expr = `(() => {
    const visivel = el => !!(el.offsetParent || el.getClientRects().length);
    const inputs = Array.from(document.querySelectorAll('input')).filter(i => {
      const t = (i.type || 'text').toLowerCase();
      return (t === 'text' || t === 'search') && visivel(i) && i.id !== 'g-recaptcha-response';
    });
    const nome = inputs.find(i => /nome/i.test((i.getAttribute('formcontrolname')||'') + ' ' + (i.name||'') + ' ' + (i.id||''))) || inputs[0];
    if (!nome) return false;
    nome.focus();
    ['keydown','keypress','keyup'].forEach(t => nome.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })));
    return true;
  })()`;
  await browser.avaliar(expr, sid).catch(() => {});
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
    log("   Quando a tela de busca abrir, eu preencho TODOS os campos (CPF, nome, filiação, nascimento) e disparo a busca sozinho.");
    log(`(aguardando até ${Math.round(timeoutMs / 60000)} min)`);

    // O portal redireciona p/ #/captcha/ até o reCAPTCHA ser resolvido; depois
    // volta p/ a busca. Esperamos a tela de busca (input de texto visível).
    const TELA_BUSCA = `(!location.hash.toLowerCase().includes('captcha') && Array.from(document.querySelectorAll('input')).some(i => ((i.type||'text')==='text' || i.type==='search') && (i.offsetParent||i.getClientRects().length) && i.id!=='g-recaptcha-response'))`;

    // O operador SÓ resolve o captcha. O preenchimento de TODOS os campos e o
    // disparo da busca são automáticos — e o disparo é PERSISTENTE: re-tentamos a
    // cada ciclo (Enter + clique) até capturarmos a resposta do /filter (ou
    // /pecas). Assim, se o 1º disparo sair antes de o Angular habilitar o botão ou
    // de o token do captcha valer, as tentativas seguintes pegam — sem clique manual.
    log("Resolva o reCAPTCHA — eu preencho todos os campos e disparo a busca sozinho, re-tentando até a resposta voltar.");
    let resp: RespostaCapturada | null = null;
    const deadline = Date.now() + timeoutMs;
    let tentativas = 0;
    let preenchido = false;
    while (Date.now() < deadline) {
      resp =
        browser.respostasCapturadas(ALVO_FILTER)[0] ??
        browser.respostasCapturadas(ALVO_PECAS)[0] ??
        null;
      if (resp) break;
      if (!(await browser.vivo())) break;
      // Só age depois que a tela de busca aparece (fora do captcha).
      const naBusca = await browser
        .avaliar<boolean>(`!!(${TELA_BUSCA})`, sid)
        .catch(() => false);
      if (naBusca === true) {
        await browser.reinjetarHook(sid).catch(() => {});
        // Preenche todos os campos uma vez; re-preenche só se o nome esvaziou
        // (ex.: a SPA recarregou a tela de busca).
        const nomeAtual =
          (await browser.valorDe(sid, 'input[name="nomePessoa"]').catch(() => null)) ?? "";
        if (!preenchido || !nomeAtual) {
          const f = await preencherCamposBnmp(browser, sid, locatario).catch(
            () => null,
          );
          if (f) {
            log(
              `Campos do BNMP preenchidos → nome:${f.nome} CPF:${f.cpf} mãe:${f.mae} pai:${f.pai} nasc.:${f.nascimento} — disparando a busca...`,
            );
            preenchido = true;
          }
        }
        await enviarEnterBnmp(browser, sid);
        await browser.clicarTexto(sid, ["Pesquisar", "Buscar", "Consultar"]);
        tentativas++;
      }
      await sleep(2500);
    }
    if (resp) log(`Resposta do BNMP capturada (após ${tentativas} tentativa(s) de busca).`);

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
