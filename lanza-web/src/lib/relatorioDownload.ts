/** Extrai texto plano de respostas de relatório para download / visualização. */

export function textoCobrancas(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const lotes = (data as { lotes?: unknown[] }).lotes ?? [];
  const blocos: string[] = [];
  for (const lote of lotes) {
    if (!lote || typeof lote !== "object") continue;
    const tipo = String((lote as { tipo?: string }).tipo ?? "cobrança");
    const items = (lote as { items?: unknown[] }).items ?? [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const resultados = (item as { resultados?: unknown[] }).resultados ?? [];
      for (const r of resultados) {
        if (!r || typeof r !== "object") continue;
        const texto = (r as { texto?: string }).texto;
        if (texto?.trim()) blocos.push(texto.trim());
      }
    }
    if (items.length === 0) blocos.push(`[${tipo}] sem mensagens`);
  }
  return blocos.join("\n\n---\n\n");
}

export function textoPrestacaoContas(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const textos = (data as { textos?: { parceiro: string; texto: string }[] }).textos ?? [];
  return textos.map((t) => `=== ${t.parceiro} ===\n${t.texto}`).join("\n\n");
}

export function textoEncerramento(res: {
  whatsapp?: string;
  texto?: string;
  data?: unknown;
}): string {
  const partes: string[] = [];
  if (res.texto?.trim()) partes.push(res.texto.trim());
  if (res.whatsapp?.trim()) {
    partes.push("--- WhatsApp ---\n" + res.whatsapp.trim());
  }
  if (partes.length) return partes.join("\n\n");
  if (res.data != null) return JSON.stringify(res.data, null, 2);
  return "";
}

export function downloadArquivoTexto(nomeBase: string, conteudo: string, ext = "txt") {
  const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeBase}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Abre diálogo de impressão — o utilizador pode guardar como PDF. */
export function downloadPdfViaImpressao(titulo: string, conteudo: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }

  const safe = conteudo
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${titulo.replace(/</g, "")}</title>
  <style>
    body { font-family: ui-monospace, Consolas, monospace; font-size: 11pt; line-height: 1.45; margin: 1.5cm; white-space: pre-wrap; }
    @page { margin: 1.5cm; }
  </style>
</head>
<body>${safe}</body>
</html>`);
  doc.close();

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();

  window.setTimeout(() => iframe.remove(), 1500);
}

export type RelatorioModoEntrega = "visualizar" | "txt" | "pdf";
