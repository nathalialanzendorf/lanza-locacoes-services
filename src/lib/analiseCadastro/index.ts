/**
 * Orquestrador da triagem de locatário.
 *
 * Abre UM Chrome real e roda as fontes selecionadas EM PARALELO: as 3 abas
 * abrem ao mesmo tempo e o operador resolve o captcha/login de cada uma na
 * ordem que preferir (sem esperar uma fonte terminar para a próxima abrir).
 * Cada fonte tem estado isolado no harness — só o BNMP usa captura de resposta
 * e só a PF usa download — então não há colisão entre elas; o cliente CDP
 * indexa as respostas por id, suportando chamadas concorrentes. Agrega os
 * resultados num relatório.
 *
 * Fontes:
 *   - bnmp     CNJ BNMP (mandados/procurados) — captura da busca por nome.
 *   - pf       PF SINIC (antecedentes nacionais) — captura do PDF.
 *   - tjsc     TJSC certidão criminal — passo assistido (e-mail).
 */
import { TriagemBrowser } from "./browser.js";
import { consultarBnmp } from "./bnmp.js";
import { consultarPfSinic } from "./pfSinic.js";
import { consultarTjsc } from "./tjsc.js";
import type { DadosLocatario, ResultadoFonte } from "./tipos.js";

export type FonteId = "bnmp" | "pf" | "tjsc";

export interface OpcoesTriagem {
  fontes: FonteId[];
  timeoutMin?: number;
  prompt?: (msg: string) => void;
  /** Chamado antes de fechar o Chrome (ex.: aguardar Enter do operador). */
  aguardarFim?: () => Promise<void>;
  /** TJSC: e-mail de resposta, finalidade e telefone de contato da requisição. */
  emailTjsc?: string | null;
  finalidadeTjsc?: string | null;
  telefoneTjsc?: string | null;
}

/** Metadados de identidade de cada fonte (para montar um resultado de erro). */
const META_FONTE: Record<FonteId, { id: string; nome: string }> = {
  bnmp: { id: "bnmp", nome: "CNJ BNMP — mandados de prisão / procurados" },
  pf: { id: "pf-sinic", nome: "PF SINIC — certidão de antecedentes criminais (nacional)" },
  tjsc: { id: "tjsc", nome: "TJSC — certidão criminal estadual (eproc)" },
};

/** Converte uma falha (rejeição) de uma fonte num ResultadoFonte de erro. */
function fonteComErro(id: FonteId, motivo: unknown): ResultadoFonte {
  const msg = motivo instanceof Error ? motivo.message : String(motivo);
  return {
    ...META_FONTE[id],
    status: "erro",
    alerta: false,
    observacao: `Falha ao executar a fonte: ${msg}`,
    achados: [],
    consultadoEm: new Date().toISOString(),
  };
}

export async function executarTriagem(
  locatario: DadosLocatario,
  opts: OpcoesTriagem,
): Promise<ResultadoFonte[]> {
  const log = opts.prompt ?? ((m: string) => console.log(m));
  const timeoutMs = (opts.timeoutMin ?? 6) * 60 * 1000;

  log("Abrindo o Chrome (perfil dedicado da triagem)...");
  const browser = await TriagemBrowser.iniciar();
  log(
    "Chrome aberto. As abas das fontes abrem EM PARALELO — resolva o captcha/login de cada uma na ordem que preferir.",
  );

  // Dispara as fontes selecionadas concorrentemente (cada uma abre a sua aba e
  // tem o seu próprio timeout). A ordem do array preserva a ordem do relatório.
  const ordem: FonteId[] = [];
  const tarefas: Promise<ResultadoFonte>[] = [];
  if (opts.fontes.includes("bnmp")) {
    ordem.push("bnmp");
    tarefas.push(consultarBnmp(browser, locatario, { timeoutMs, prompt: log }));
  }
  if (opts.fontes.includes("pf")) {
    ordem.push("pf");
    tarefas.push(consultarPfSinic(browser, locatario, { timeoutMs, prompt: log }));
  }
  if (opts.fontes.includes("tjsc")) {
    ordem.push("tjsc");
    tarefas.push(
      consultarTjsc(browser, locatario, {
        prompt: log,
        timeoutMs,
        emailResposta: opts.emailTjsc,
        finalidade: opts.finalidadeTjsc,
        telefone: opts.telefoneTjsc,
      }),
    );
  }

  // Assim que as janelas das fontes abrirem, fecha a janela "about:blank" inicial
  // que o Chrome cria ao subir (não deixa janela em branco pendurada).
  setTimeout(() => {
    void browser.fecharAbasEmBranco();
  }, 6000);

  let resultados: ResultadoFonte[] = [];
  try {
    const liquidados = await Promise.allSettled(tarefas);
    resultados = liquidados.map((r, i) =>
      r.status === "fulfilled" ? r.value : fonteComErro(ordem[i], r.reason),
    );
  } finally {
    // Passo assistido do TJSC (Enter/flag): só depois que as fontes terminam,
    // para o operador concluir a requisição antes de o Chrome fechar.
    if (opts.aguardarFim) {
      try {
        await opts.aguardarFim();
      } catch {
        /* segue para o fechamento */
      }
    }
    log("");
    log("Fechando o Chrome...");
    await browser.fechar();
  }

  return resultados;
}
