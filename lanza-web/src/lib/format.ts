export function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Valor monetário para campo de texto (ex.: 610,05). */
export function formatValorInput(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Aceita 610,05 · 1.610,05 · 610.05 (URL/JS). */
export function parseValorInput(raw: string): number | null {
  const s = String(raw).trim().replace(/\s/g, "");
  if (!s) return null;

  let normalized: string;
  if (s.includes(",")) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const parts = s.split(".");
    normalized = parts.length === 2 && parts[1]!.length <= 2 ? s : s.replace(/\./g, "");
  } else {
    normalized = s;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function formatPlaca(placa?: string): string {
  if (!placa) return "—";
  const raw = placa.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (raw.length === 7) return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  return placa;
}

export type VeiculoLabelInput = {
  placa?: string | null;
  id?: string;
  marcaModelo?: string | null;
  marca?: string | null;
  modelo?: string | null;
  anoModelo?: string | null;
};

/** Rótulo padrão de combobox: PLACA · marca/modelo · ano. */
export function formatVeiculoLabel(v: VeiculoLabelInput): string {
  const placa = formatPlaca(v.placa ?? v.id);
  const modelo =
    v.marcaModelo?.trim() ||
    [v.marca?.trim(), v.modelo?.trim()].filter(Boolean).join(" ").trim();
  const ano = v.anoModelo?.trim();
  const parts = [placa];
  if (modelo) parts.push(modelo);
  if (ano) parts.push(ano);
  return parts.join(" · ");
}

export type ClienteLabelInput = {
  nome?: string | null;
  id?: string;
  ativo?: boolean;
};

/** Rótulo padrão de cliente: só o nome; inativo em MAIÚSCULAS. */
export function formatClienteLabel(c: ClienteLabelInput): string {
  const nome = c.nome?.trim() || c.id?.slice(0, 8) || "—";
  if (c.ativo === false) return nome.toLocaleUpperCase("pt-BR");
  return nome;
}

/** Nome para exibição quando só há texto (sem cadastro); inativo opcional. */
export function formatClienteNomeExibicao(nome: string | null | undefined, ativo?: boolean): string {
  const n = nome?.trim();
  if (!n) return "—";
  if (ativo === false) return n.toLocaleUpperCase("pt-BR");
  return n;
}

/** Resolve nome formatado por id do cadastro ou fallback denormalizado. */
export function clienteExibicaoPorId(
  clientes: ClienteLabelInput[] | undefined,
  clienteId: string | null | undefined,
  fallbackNome?: string | null,
): string {
  const id = clienteId?.trim();
  if (id) {
    const c = clientes?.find((x) => x.id === id);
    if (c) return formatClienteLabel(c);
  }
  return formatClienteNomeExibicao(fallbackNome);
}

export function statusLabel(ativo?: boolean): string {
  return ativo === false ? "Inativo" : "Ativo";
}

export function statusClass(ativo?: boolean): string {
  return ativo === false ? "badge badge--muted" : "badge badge--ok";
}
