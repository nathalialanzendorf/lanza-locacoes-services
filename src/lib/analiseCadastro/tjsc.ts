/**
 * Fonte TJSC — Certidão Criminal estadual (eproc). Padrão gov.br (igual DETRAN).
 *
 * O ÚNICO passo manual é o **login gov.br (prata) + credencial PJSC** na janela
 * (como no solver do DETRAN SC/RS). Depois do login, o harness:
 *   1. detecta o retorno ao domínio `*.tjsc.jus.br`;
 *   2. abre o formulário de Requisição de Certidão (`/pedidoCertidao`);
 *   3. marca instâncias (1º e 2º grau) e o modelo **Criminal**;
 *   4. preenche os campos por SELETOR EXATO (form HTML estável `name`/`id`):
 *      nome, CPF, tipo pessoa, RG/órgão (ou "não conhece"), filiação, nascimento,
 *      endereço/município, e-mail, telefone de contato (Lanza) e finalidade;
 *   5. marca as declarações (veracidade + LGPD) e ENVIA (`#enviar`);
 *   6. captura os números de pedido da confirmação.
 * A certidão volta por **e-mail** (até 5 dias úteis) — anexar ao caso depois.
 *
 * Município de residência é OBRIGATÓRIO no TJSC: sem ele (não veio do comprovante),
 * o passo fica "assistido" — tudo pré-preenchido e o operador só escolhe o
 * município e clica Enviar.
 *
 * A sessão gov.br fica salva no perfil dedicado do Chrome (USER_DATA_DIR), então
 * execuções seguintes reaproveitam o login. Ver `.cursor/tools/tjsc-certidoes/`.
 */
import type { TriagemBrowser } from "./browser.js";
import { sleep } from "./browser.js";
import type { DadosLocatario, ResultadoFonte } from "./tipos.js";

const PORTAL = "https://certidoes.tjsc.jus.br/";
const FORM_URL = "https://certidoes.tjsc.jus.br/pedidoCertidao";

/** Telefone de contato padrão da Lanza Locações (campo "Telefone para Contato"). */
const TELEFONE_CONTATO_LANZA = "4898834442";

// Logado quando a aba está num host de APP do TJSC (certidoes/app), não no
// SSO/gov.br, E a página mostra o marcador de sessão autenticada (link "Sair" +
// o cabeçalho "Perfis:"/o próprio formulário). Só o host + tamanho de texto dava
// FALSO POSITIVO: ao abrir um perfil limpo, certidoes aparece por instantes antes
// de redirecionar ao SSO. Exigimos também ESTABILIDADE (várias leituras seguidas).
const LOGADO = String.raw`(/(certidoes|app)\.tjsc\.jus\.br$/.test(location.host) && !/^sso\./.test(location.host) && document.body && /\bSair\b/.test(document.body.innerText || '') && (document.querySelector('input[name="nome"]') || /Perfis?:/i.test(document.body.innerText || '')))`;

// Tela de "Verificação de segurança" (bloqueio anti-bot) que o TJSC passa a
// servir em QUALQUER URL após muitos acessos seguidos — tem um captcha de IMAGEM
// próprio ("digite o código exibido na imagem") e um "Support ID: ..._BOT".
// Quando aparece, o /pedidoCertidao "redireciona" para essa página de bloqueio.
const BLOQUEIO = String.raw`(!!document.body && /(verifica[cç][aã]o de seguran[cç]a|acesso foi bloqueado temporariamente|Support ID|_BOT)/i.test(document.body.innerText || ''))`;

/** UF → nome do estado como aparece no <select> de endereço do TJSC. */
const UF_NOME: Record<string, string> = {
  AC: "ACRE",
  AL: "ALAGOAS",
  AP: "AMAPÁ",
  AM: "AMAZONAS",
  BA: "BAHIA",
  CE: "CEARÁ",
  DF: "DISTRITO FEDERAL",
  ES: "ESPÍRITO SANTO",
  GO: "GOIÁS",
  MA: "MARANHÃO",
  MT: "MATO GROSSO",
  MS: "MATO GROSSO DO SUL",
  MG: "MINAS GERAIS",
  PA: "PARÁ",
  PB: "PARAÍBA",
  PR: "PARANÁ",
  PE: "PERNAMBUCO",
  PI: "PIAUÍ",
  RJ: "RIO DE JANEIRO",
  RN: "RIO GRANDE DO NORTE",
  RS: "RIO GRANDE DO SUL",
  RO: "RONDÔNIA",
  RR: "RORAIMA",
  SC: "SANTA CATARINA",
  SP: "SÃO PAULO",
  SE: "SERGIPE",
  TO: "TOCANTINS",
};

const agora = (): string => new Date().toISOString();

export interface OpcoesTjsc {
  prompt?: (msg: string) => void;
  timeoutMs?: number;
  emailResposta?: string | null;
  finalidade?: string | null;
  /** Telefone de contato (default: telefone da Lanza Locações). */
  telefone?: string | null;
}

interface DadosForm {
  nome: string;
  cpf: string;
  nascimento: string;
  mae: string;
  pai: string;
  rg: string;
  orgao: string;
  email: string;
  telefone: string;
  finalidade: string;
  estadoNome: string;
  municipio: string;
  endereco: string;
}

interface ResultadoFill {
  ok: boolean;
  motivo?: string;
  criminalOk?: boolean;
  municipioOk?: boolean;
  faltando?: string[];
}

interface Protocolo {
  pedido: string;
  tipo: string;
}

/**
 * Função (serializada p/ a página) que preenche o formulário de requisição do
 * TJSC por seletor exato. Recebe `dados` (JSON) e devolve um diagnóstico.
 */
const FILL_FN = String.raw`
(function (dados) {
  var q = function (s) { return document.querySelector(s); };
  var setVal = function (el, v) {
    if (!el) return false;
    var proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : (el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype);
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  };
  var check = function (el, on) { if (el && el.checked !== on) el.click(); return !!el; };
  var selByText = function (sel, re) {
    var el = q(sel); if (!el) return null;
    var rx = new RegExp(re, 'i');
    var opt = null;
    for (var i = 0; i < el.options.length; i++) { if (rx.test((el.options[i].text || '').trim())) { opt = el.options[i]; break; } }
    if (opt) { setVal(el, opt.value); return opt.text.trim() + '=' + opt.value; }
    return null;
  };
  var selByExact = function (sel, texto) {
    var el = q(sel); if (!el || !texto) return null;
    var alvo = String(texto).trim().toLowerCase();
    var opt = null;
    for (var i = 0; i < el.options.length; i++) { if ((el.options[i].text || '').trim().toLowerCase() === alvo) { opt = el.options[i]; break; } }
    if (opt) { setVal(el, opt.value); return opt.text.trim() + '=' + opt.value; }
    return null;
  };

  if (!q('input[name="nome"]') || !q('#enviar')) return { ok: false, motivo: 'form-nao-encontrado' };

  // Instâncias: 1º e 2º grau.
  var insts = document.querySelectorAll('input[name="instancia[]"]');
  for (var a = 0; a < insts.length; a++) check(insts[a], true);

  // Modelo: só CRIMINAL (identifica pelo texto adjacente ao checkbox).
  var criminalOk = false;
  var mods = document.querySelectorAll('input[name="modelo[]"]');
  for (var b = 0; b < mods.length; b++) {
    var el = mods[b], t = '', n = el.nextSibling;
    while (n && !t) {
      if (n.nodeType === 3 && n.textContent.trim()) t = n.textContent;
      else if (n.nodeType === 1 && n.innerText && n.innerText.trim()) t = n.innerText;
      n = n.nextSibling;
    }
    var ehCriminal = /criminal/i.test(t);
    check(el, ehCriminal);
    if (ehCriminal) criminalOk = true;
  }

  setVal(q('input[name="nome"]'), dados.nome);
  selByText('#tipo_pessoa', '^\\s*f[ií]sica\\s*$');
  setVal(q('#cpf_mascara'), dados.cpf);

  // RG + órgão expedidor (ou declara não conhecer).
  if (dados.rg) {
    check(q('#rg_checkbox'), false);
    setVal(q('#rg_texto'), dados.rg);
    if (dados.orgao) setVal(q('#orgao_expedidor_texto'), dados.orgao);
  } else {
    check(q('#rg_checkbox'), true);
  }

  selByText('#nacionalidade', 'brasileir');
  check(q('#estado_civil_checkbox'), true); // estado civil não informado

  if (dados.mae) { check(q('#nome_mae_checkbox'), false); setVal(q('#nome_mae_texto'), dados.mae); }
  else { check(q('#nome_mae_checkbox'), true); }
  if (dados.pai) { check(q('#nome_pai_checkbox'), false); setVal(q('#nome_pai_texto'), dados.pai); }
  else { check(q('#nome_pai_checkbox'), true); }

  if (dados.nascimento) { check(q('#data_nascimento_checkbox'), false); setVal(q('#data_nascimento_texto'), dados.nascimento); }
  else { check(q('#data_nascimento_checkbox'), true); }

  // Endereço — município é OBRIGATÓRIO no TJSC.
  var municipioOk = false;
  selByText('#pais_endereco', 'brasil');
  if (dados.estadoNome) selByExact('#estado_endereco', dados.estadoNome);
  if (dados.municipio) {
    var m = selByExact('#municipio_endereco', dados.municipio);
    municipioOk = !!m;
    check(q('#endereco_checkbox'), !dados.endereco);
    if (dados.endereco) setVal(q('#outros_dados_endereco'), dados.endereco);
  } else {
    check(q('#endereco_checkbox'), true);
  }

  setVal(q('input[name="email"]'), dados.email || '');
  setVal(q('input[name="telefone"]'), dados.telefone || '');
  setVal(q('input[name="finalidade"]'), dados.finalidade || '');
  check(q('input[name="declaracaoVeracidadeDados"]'), true);
  check(q('input[name="declaracaoLGPD"]'), true);

  var faltando = [];
  if (!criminalOk) faltando.push('modelo Criminal');
  if (!municipioOk) faltando.push('município de residência');
  return { ok: true, criminalOk: criminalOk, municipioOk: municipioOk, faltando: faltando };
})`;

/** Lê os números de pedido da tela de confirmação do TJSC. */
const PROTOCOLOS_FN = String.raw`
(function () {
  var txt = (document.body.innerText || '').replace(/\r/g, '');
  var sucesso = /cadastrado com sucesso/i.test(txt) || /processaCertidao/i.test(location.href);
  var re = /N[\u00famu]mero do Pedido:\s*(\d+)\s*Tipo de Certid[\u00e3a]o:\s*([^\n]+)/g;
  var pedidos = [], m;
  while ((m = re.exec(txt))) pedidos.push({ pedido: m[1], tipo: m[2].trim() });
  return { sucesso: sucesso, pedidos: pedidos };
})()`;

/**
 * Se a aba estiver na tela de "Verificação de segurança" (bloqueio anti-bot do
 * TJSC), pede ao operador para resolver o CAPTCHA DE IMAGEM do bloqueio e espera
 * a página liberar. Devolve `true` se o caminho está livre (não bloqueado ou já
 * liberado) e `false` se continuou bloqueado após a espera.
 */
async function aguardarSeBloqueado(
  browser: TriagemBrowser,
  sid: string,
  log: (m: string) => void,
  timeoutMs: number,
): Promise<boolean> {
  const bloqueado = await browser.avaliar<boolean>(`!!(${BLOQUEIO})`, sid).catch(() => false);
  if (!bloqueado) return true;
  log("");
  log("!! TJSC com VERIFICAÇÃO DE SEGURANÇA (bloqueio anti-bot temporário).");
  log("   Na janela do TJSC, digite o CÓDIGO DA IMAGEM exibido para liberar o acesso");
  log("   (é o captcha do bloqueio, NÃO o gov.br). Assim que liberar, eu sigo sozinho.");
  const liberou = await browser.esperarCondicao(sid, `!(${BLOQUEIO})`, timeoutMs, 2000);
  if (liberou) {
    log("Bloqueio liberado — seguindo.");
    await browser.reinjetarHook(sid).catch(() => {});
  }
  return liberou;
}

export async function consultarTjsc(
  browser: TriagemBrowser,
  locatario: DadosLocatario,
  opts: OpcoesTjsc = {},
): Promise<ResultadoFonte> {
  const log = opts.prompt ?? ((m: string) => console.log(m));
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const email = (opts.emailResposta ?? "").trim();
  const finalidade = (opts.finalidade ?? "Análise para locação de veículo").trim();
  const telefone = (opts.telefone ?? TELEFONE_CONTATO_LANZA).trim();

  const base: ResultadoFonte = {
    id: "tjsc",
    nome: "TJSC — certidão criminal estadual (eproc)",
    status: "assistido",
    alerta: false,
    observacao: "",
    achados: [],
    consultadoEm: agora(),
  };

  let sid: string;
  try {
    sid = await browser.novaAba(PORTAL);
  } catch (e) {
    return {
      ...base,
      status: "erro",
      observacao: `Não consegui abrir o portal do TJSC: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  log("");
  log("== TJSC — Certidão Criminal (eproc) ==");
  log(">> Na aba do TJSC, faça APENAS o LOGIN gov.br (nível prata) + credencial PJSC.");
  log("   Para a requisição sair em nome da LANZA LOCAÇÕES (CNPJ) como solicitante,");
  log("   logue no gov.br com o CERTIFICADO DIGITAL e-CNPJ da empresa (não a PF).");
  log("   Não precisa preencher nada — eu cuido da requisição depois que você logar.");
  log(`(aguardando o login até ${Math.round(timeoutMs / 60000)} min)`);

  // Antes de tudo: se o portal estiver com a verificação de segurança (bloqueio
  // anti-bot), o operador resolve o captcha de imagem do bloqueio e só então o
  // login gov.br aparece.
  if (!(await aguardarSeBloqueado(browser, sid, log, timeoutMs))) {
    return {
      ...base,
      status: "assistido",
      consultadoEm: agora(),
      observacao:
        "TJSC bloqueado por verificação de segurança (anti-bot) e não liberado no tempo de espera. Aguarde alguns minutos e refaça, ou conclua a requisição manualmente.",
    };
  }

  // Espera login ESTÁVEL: a condição precisa valer em 3 leituras seguidas (~6s)
  // para não disparar no host transitório durante o redirect do gov.br.
  let estavel = 0;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await browser
      .avaliar<boolean>(`!!(${LOGADO})`, sid)
      .catch(() => false);
    estavel = ok ? estavel + 1 : 0;
    if (estavel >= 3) break;
    if (!(await browser.vivo())) break;
    await sleep(2000);
  }
  if (estavel < 3) {
    return {
      ...base,
      status: "assistido",
      consultadoEm: agora(),
      observacao:
        "Login gov.br não concluído no tempo de espera — conclua a requisição da certidão Criminal manualmente no portal do TJSC.",
    };
  }

  log("Login detectado. Abrindo o formulário de requisição...");
  // Garante o formulário de requisição (o pós-login costuma cair em /pedidoCertidao,
  // mas navegamos explicitamente para não depender disso).
  await browser.navegar(sid, FORM_URL);
  await sleep(2500);
  await browser.reinjetarHook(sid);
  // O /pedidoCertidao também pode cair na verificação de segurança — trata aqui.
  if (!(await aguardarSeBloqueado(browser, sid, log, 3 * 60 * 1000))) {
    return {
      ...base,
      status: "assistido",
      consultadoEm: agora(),
      observacao:
        "TJSC bloqueado por verificação de segurança (anti-bot) ao abrir o /pedidoCertidao. Aguarde alguns minutos e refaça, ou conclua a requisição manualmente.",
    };
  }
  const temForm = await browser.esperarCondicao(
    sid,
    `document.querySelector('input[name="nome"]') && document.querySelector('#enviar')`,
    20000,
  );
  if (!temForm) {
    log(`[tjsc snapshot] ${await browser.snapshot(sid)}`);
    return {
      ...base,
      status: "assistido",
      consultadoEm: agora(),
      observacao:
        "Login detectado, mas o formulário de requisição não abriu — conclua a requisição da certidão Criminal manualmente no portal do TJSC.",
    };
  }

  // Dados do formulário (CNH + comprovante de endereço, quando disponíveis).
  const uf = (locatario.ufResidencia ?? "").trim().toUpperCase();
  const dados: DadosForm = {
    nome: locatario.nome,
    cpf: locatario.cpfFormatado,
    nascimento: (locatario.nascimento ?? "").trim(),
    mae: (locatario.maeNome ?? "").trim(),
    pai: (locatario.paiNome ?? "").trim(),
    rg: (locatario.rg ?? "").trim(),
    orgao: (locatario.orgaoExpedidor ?? "").trim(),
    email,
    telefone,
    finalidade,
    estadoNome: UF_NOME[uf] ?? "",
    municipio: (locatario.municipioResidencia ?? "").trim(),
    endereco: (locatario.enderecoResidencia ?? "").trim(),
  };

  const fill = await browser
    .avaliar<ResultadoFill>(`${FILL_FN}(${JSON.stringify(dados)})`, sid)
    .catch((e) => ({ ok: false, motivo: e instanceof Error ? e.message : String(e) }) as ResultadoFill);

  if (!fill?.ok) {
    return {
      ...base,
      status: "assistido",
      consultadoEm: agora(),
      observacao: `Não consegui preencher o formulário do TJSC (${fill?.motivo ?? "motivo desconhecido"}) — conclua a requisição da certidão Criminal manualmente.`,
    };
  }
  log(
    `TJSC preenchido → criminal:${fill.criminalOk} municipio:${fill.municipioOk}${fill.faltando?.length ? ` | falta: ${fill.faltando.join(", ")}` : ""}`,
  );

  // Sem o município (obrigatório) não dá para enviar: deixa pré-preenchido p/ o operador.
  if (!fill.municipioOk) {
    return {
      ...base,
      status: "assistido",
      consultadoEm: agora(),
      observacao:
        "Formulário do TJSC pré-preenchido (modelo Criminal, dados da CNH, declarações). FALTA o MUNICÍPIO de residência (obrigatório e não informado) — selecione o município na janela e clique Enviar. A certidão volta por e-mail.",
    };
  }

  // Envia e captura os números de pedido da confirmação.
  await sleep(500);
  await browser.avaliar(
    `(() => { const b = document.querySelector('#enviar') || document.querySelector('input[name="enviar"]'); if (b) b.click(); })()`,
    sid,
  ).catch(() => {});

  let protocolos: Protocolo[] = [];
  const okEnvio = await browser.esperarCondicao(
    sid,
    `/cadastrado com sucesso/i.test(document.body.innerText || '') || /processaCertidao/i.test(location.href)`,
    20000,
  );
  if (okEnvio) {
    const r = await browser
      .avaliar<{ sucesso: boolean; pedidos: Protocolo[] }>(PROTOCOLOS_FN, sid)
      .catch(() => ({ sucesso: false, pedidos: [] as Protocolo[] }));
    protocolos = r?.pedidos ?? [];
  }

  if (!okEnvio) {
    return {
      ...base,
      status: "assistido",
      consultadoEm: agora(),
      observacao:
        "Formulário do TJSC preenchido e envio acionado, mas não confirmei o cadastro — verifique a janela (pode faltar um campo) e clique Enviar. A certidão volta por e-mail.",
    };
  }

  const criminais = protocolos.filter((p) => /criminal/i.test(p.tipo)).map((p) => p.pedido);
  const listaProt = protocolos.map((p) => p.pedido).join(", ");
  return {
    ...base,
    status: "assistido",
    consultadoEm: agora(),
    observacao:
      `Requisição da certidão Criminal ENVIADA ao TJSC` +
      (listaProt ? ` (pedidos: ${listaProt}${criminais.length ? `; Criminal: ${criminais.join(", ")}` : ""})` : "") +
      `. Resposta por e-mail (${email || "e-mail informado"}) em até 5 dias úteis. Conferir a caixa de entrada e anexar o(s) PDF(s) ao caso.`,
  };
}
