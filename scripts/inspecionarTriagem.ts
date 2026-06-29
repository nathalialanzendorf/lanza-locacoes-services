/**
 * Script de RECONHECIMENTO (descartável) — abre os portais da triagem e despeja
 * os campos de formulário (inputs/selects/botões) para descobrirmos os seletores
 * reais e implementar o auto-preenchimento. Não é parte do fluxo de produção.
 *
 *   npx tsx scripts/inspecionarTriagem.ts [bnmp|pf|tjsc]
 */
import { TriagemBrowser, sleep } from "../src/lib/analiseCadastro/browser.js";

const PORTAIS: Record<string, string> = {
  bnmp: "https://portalbnmp.cnj.jus.br/#/pesquisa-peca",
  pf: "https://servicos.pf.gov.br/epol-sinic-publico/",
  tjsc: "https://certidoes.tjsc.jus.br/",
};

const DUMP = `JSON.stringify((() => {
  const desc = (el) => ({
    tag: el.tagName,
    type: el.getAttribute('type'),
    id: el.id || null,
    name: el.getAttribute('name'),
    fcn: el.getAttribute('formcontrolname'),
    placeholder: el.getAttribute('placeholder'),
    aria: el.getAttribute('aria-label'),
    role: el.getAttribute('role'),
    text: (el.innerText || el.value || '').toString().trim().slice(0, 50),
    cls: (el.className || '').toString().slice(0, 70),
    vis: !!(el.offsetParent || el.getClientRects().length),
  });
  const sel = 'input,select,textarea,button,mat-select,[formcontrolname],[role=button]';
  const els = Array.from(document.querySelectorAll(sel));
  return {
    url: location.href,
    title: document.title,
    nEls: els.length,
    campos: els.map(desc),
  };
})())`;

async function main() {
  const alvo = (process.argv[2] || "bnmp").toLowerCase();
  const url = PORTAIS[alvo];
  if (!url) {
    console.error("Use: bnmp | pf | tjsc");
    process.exit(1);
  }
  const browser = await TriagemBrowser.iniciar();
  const sid = await browser.novaAba(url);
  console.log(`Abrindo ${url} — aguardando render da SPA...`);
  await sleep(7000);
  await browser.reinjetarHook(sid);
  try {
    const json = await browser.avaliar<string>(DUMP, sid, 20000);
    console.log("===DUMP-INICIO===");
    console.log(json);
    console.log("===DUMP-FIM===");
  } catch (e) {
    console.error("Falha ao avaliar:", e instanceof Error ? e.message : e);
  }
  await sleep(1500);
  await browser.fechar();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
