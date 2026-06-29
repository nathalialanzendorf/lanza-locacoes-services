/**
 * Agregação e gravação do relatório de análise de cadastro de locatário.
 *
 * Grava dois arquivos em `relatorios/_tmp/analise-cadastro/`:
 *   - `<cpf>-<AAAA-MM-DD>.json`  estruturado (schema `triagem-locatario/v2`) —
 *     também é o sidecar que alimenta o canvas.
 *   - `<cpf>-<AAAA-MM-DD>.txt`   documento legível (para leitura/decisão).
 *
 * Convenção do projeto: todo relatório gera `.txt` + `.json` e um **canvas**
 * (passo do agente; ver a skill). A base legal (LGPD) fica gravada para auditoria.
 */
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "../repoRoot.js";
import { RELATORIOS_ANALISE_CADASTRO_DIR } from "../relatoriosPaths.js";
import type { DadosLocatario, ResultadoFonte } from "./tipos.js";

export interface DadosLgpd {
  baseLegal: string;
  titularConsentimento: string;
  solicitante: string | null;
  finalidade: string;
}

export interface RelatorioTriagem {
  schema: "triagem-locatario/v2";
  geradoEm: string;
  locatario: DadosLocatario;
  lgpd: DadosLgpd;
  fontes: ResultadoFonte[];
  /** Conclusão automática: há alerta em alguma fonte? */
  alertaGeral: boolean;
  resumo: string;
}

export function montarRelatorio(args: {
  locatario: DadosLocatario;
  lgpd: DadosLgpd;
  fontes: ResultadoFonte[];
}): RelatorioTriagem {
  const alertaGeral = args.fontes.some((f) => f.alerta);
  const comAlerta = args.fontes.filter((f) => f.alerta).map((f) => f.id);
  const assistidas = args.fontes.filter((f) => f.status === "assistido").map((f) => f.id);

  let resumo: string;
  if (alertaGeral) {
    resumo = `ATENÇÃO: alerta em ${comAlerta.join(", ")}. Revisar os achados e conferir homônimos (CPF/nascimento) antes de decidir.`;
  } else if (args.fontes.every((f) => f.status === "ok")) {
    resumo = "Sem alertas nas fontes automáticas (BNMP / PF SINIC).";
  } else {
    resumo = "Sem alertas nas fontes concluídas.";
  }
  if (assistidas.length) {
    resumo += ` Pendente (assistido/e-mail): ${assistidas.join(", ")}.`;
  }

  return {
    schema: "triagem-locatario/v2",
    geradoEm: new Date().toISOString(),
    locatario: args.locatario,
    lgpd: args.lgpd,
    fontes: args.fontes,
    alertaGeral,
    resumo,
  };
}

function statusIcone(f: ResultadoFonte): string {
  if (f.status === "erro") return "[ERRO]";
  if (f.status === "assistido") return "[ASSISTIDO]";
  if (f.status === "pendente") return "[PENDENTE]";
  if (f.status === "pulado") return "[PULADO]";
  return f.alerta ? "[ALERTA]" : "[OK]";
}

export function relatorioParaTexto(r: RelatorioTriagem): string {
  const linhas: string[] = [];
  linhas.push(`ANÁLISE DE CADASTRO — ${r.locatario.nome}`);
  linhas.push(`CPF: ${r.locatario.cpfFormatado}  |  Nascimento: ${r.locatario.nascimento}`);
  linhas.push(`Gerado em: ${r.geradoEm}`);
  linhas.push("");
  linhas.push("CONCLUSÃO");
  linhas.push(`${r.alertaGeral ? "ATENÇÃO — há alerta." : "Sem alertas automáticos."} ${r.resumo}`);
  linhas.push("");
  linhas.push("LGPD");
  linhas.push(`- Base legal: ${r.lgpd.baseLegal}`);
  linhas.push(`- Titular do consentimento: ${r.lgpd.titularConsentimento}`);
  if (r.lgpd.solicitante) linhas.push(`- Solicitante: ${r.lgpd.solicitante}`);
  linhas.push(`- Finalidade: ${r.lgpd.finalidade}`);
  linhas.push("");
  linhas.push("FONTES");
  for (const f of r.fontes) {
    linhas.push("");
    linhas.push(`${statusIcone(f)} ${f.nome}`);
    linhas.push(`  Status: ${f.status}${f.alerta ? " (ALERTA)" : ""}`);
    linhas.push(`  ${f.observacao}`);
    if (f.evidencia) linhas.push(`  Evidência: ${f.evidencia}`);
    if (f.achados.length) {
      linhas.push("  Achados:");
      for (const a of f.achados) linhas.push(`    - ${a.descricao}`);
    }
    linhas.push(`  Consultado em: ${f.consultadoEm}`);
  }
  linhas.push("");
  return linhas.join("\n");
}

function hojeIsoData(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Caminho-base (sem extensão) do relatório. */
export function caminhoBase(cpfDigits: string, out?: string): string {
  if (out) {
    const abs = path.isAbsolute(out) ? out : path.join(REPO_ROOT, out);
    return abs.replace(/\.(json|md|txt)$/i, "");
  }
  return path.join(RELATORIOS_ANALISE_CADASTRO_DIR, `${cpfDigits}-${hojeIsoData()}`);
}

/** Grava `<base>.json` (sidecar do canvas) e `<base>.txt`; devolve os caminhos. */
export function gravarRelatorio(
  r: RelatorioTriagem,
  base: string,
): { json: string; txt: string } {
  fs.mkdirSync(path.dirname(base), { recursive: true });
  const json = `${base}.json`;
  const txt = `${base}.txt`;
  fs.writeFileSync(json, JSON.stringify(r, null, 2) + "\n", "utf8");
  fs.writeFileSync(txt, relatorioParaTexto(r), "utf8");
  return { json, txt };
}
