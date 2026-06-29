/**
 * Fonte TJSC — Certidão Criminal estadual (eproc). PASSO ASSISTIDO.
 *
 * Exige login gov.br (prata) + credencial PJSC e a certidão volta por e-mail em
 * até 5 dias úteis — não há resultado em tempo real para capturar. Aqui apenas
 * abrimos o portal e orientamos o operador; a fonte fica como `assistido`.
 *
 * Ver `.cursor/tools/tjsc-certidoes/`.
 */
import type { TriagemBrowser } from "./browser.js";
import type { DadosLocatario, ResultadoFonte } from "./tipos.js";

const PORTAL = "https://certidoes.tjsc.jus.br/";

const agora = (): string => new Date().toISOString();

export async function consultarTjsc(
  browser: TriagemBrowser,
  locatario: DadosLocatario,
  opts: { prompt?: (msg: string) => void } = {},
): Promise<ResultadoFonte> {
  const log = opts.prompt ?? ((m: string) => console.log(m));

  const base: ResultadoFonte = {
    id: "tjsc",
    nome: "TJSC — certidão criminal estadual (eproc)",
    status: "assistido",
    alerta: false,
    observacao: "",
    achados: [],
    consultadoEm: agora(),
  };

  try {
    await browser.novaAba(PORTAL);
  } catch (e) {
    return {
      ...base,
      status: "erro",
      observacao: `Não consegui abrir o portal do TJSC: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  log("");
  log("== TJSC — Certidão Criminal (eproc) — PASSO ASSISTIDO ==");
  log("Na aba do TJSC que abriu:");
  log("  1) entre com GOV.BR (nível prata) + credencial PJSC;");
  log("  2) Certidões → Requisição → modelo CRIMINAL;");
  log(`     • Nome: ${locatario.nome}`);
  log(`     • CPF (refina/homônimos): ${locatario.cpfFormatado}`);
  log("     • E-mail de resposta + Finalidade.");
  log("  3) A certidão chega por E-MAIL (até 5 dias úteis). Anexe ao caso depois.");

  return {
    ...base,
    status: "assistido",
    consultadoEm: agora(),
    observacao:
      "Solicitação manual no portal TJSC (gov.br). Resultado por e-mail em até 5 dias úteis — anexar o PDF ao caso quando chegar.",
  };
}
