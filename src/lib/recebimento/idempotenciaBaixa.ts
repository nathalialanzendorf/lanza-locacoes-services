/**
 * Idempotência de baixa de recebimento — evita regravar PIX já quitado.
 */
import {
  loadClienteDespesasDb,
  type ClienteDespesaRegistro,
} from "../clienteDespesasDb.js";
import { stripAtrasadoSemanal } from "../pagamentoSemanal.js";

export type IdempotenciaStatus =
  | "ok"
  | "pix_ja_registrado"
  | "alvo_ja_quitado"
  | "origem_externa_ja_aplicada";

export type IdempotenciaBaixa = {
  status: IdempotenciaStatus;
  motivo: string;
  registroExistente?: {
    autoInfracao: string;
    descricao: string;
    dataAutuacao: string;
    valorMulta: number;
    pagaEm: string | null;
    rastreameId?: string | number | null;
  };
};

function mesmoDiaPagamento(dataBr: string, pagaEm: string | null | undefined): boolean {
  if (!pagaEm) return false;
  const m = dataBr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return false;
  const prefix = `${m[3]}-${m[2]}-${m[1]}`;
  if (pagaEm.startsWith(prefix)) return true;
  const d = new Date(pagaEm);
  if (Number.isNaN(d.getTime())) return false;
  const br = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return br === dataBr.trim().slice(0, 10);
}

function pagaEmIsoFromBr(dataBr: string, horaBr: string | null): string | null {
  const m = dataBr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [hh, mm] = (horaBr ?? "12:00").split(":").map(Number);
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), hh, mm, 0).toISOString();
}

function valoresProximos(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function resumoRegistro(d: ClienteDespesaRegistro): IdempotenciaBaixa["registroExistente"] {
  return {
    autoInfracao: d.autoInfracao,
    descricao: d.descricao,
    dataAutuacao: d.dataAutuacao,
    valorMulta: d.valorMulta,
    pagaEm: d.pagaEm ?? null,
    rastreameId: d.rastreameId ?? null,
  };
}

function listarDespesasIdempotencia(
  despesas?: ClienteDespesaRegistro[],
): ClienteDespesaRegistro[] {
  return despesas ?? loadClienteDespesasDb().clienteDespesas;
}

/** PIX / pagamento já lançado como quitado para este motorista. */
export function buscarPagamentoJaRegistrado(
  clienteId: string,
  valor: number,
  dataBr: string,
  horaBr?: string | null,
  despesas?: ClienteDespesaRegistro[],
): ClienteDespesaRegistro | null {
  const pagaEmIso = horaBr != null ? pagaEmIsoFromBr(dataBr, horaBr) : null;

  for (const d of listarDespesasIdempotencia(despesas)) {
    if (d.ativo === false || d.condutorId !== clienteId || d.paga !== true) continue;
    if (!valoresProximos(d.valorMulta, valor)) continue;
    if (mesmoDiaPagamento(dataBr, d.pagaEm) || d.dataAutuacao === dataBr) return d;
    if (pagaEmIso && d.pagaEm === pagaEmIso) return d;
  }
  return null;
}

function buscarPorOrigemExterna(
  origemExterna: string,
  despesas?: ClienteDespesaRegistro[],
): ClienteDespesaRegistro | null {
  const id = origemExterna.replace(/^pagbank:/, "");
  for (const d of listarDespesasIdempotencia(despesas)) {
    if (d.ativo === false) continue;
    const desc = `${d.descricao ?? ""} ${d.autoInfracao ?? ""}`;
    if (desc.includes(id) || d.autoInfracao === origemExterna) return d;
  }
  return null;
}

export function verificarIdempotenciaBaixa(
  input: {
    clienteId: string;
    valor: number;
    dataBr: string;
    horaBr?: string | null;
    origemExterna?: string | null;
    despesaId?: string | null;
    descricaoQuitada?: string | null;
  },
  despesas?: ClienteDespesaRegistro[],
): IdempotenciaBaixa {
  if (input.origemExterna) {
    const porOrigem = buscarPorOrigemExterna(input.origemExterna, despesas);
    if (porOrigem?.paga === true) {
      return {
        status: "origem_externa_ja_aplicada",
        motivo: `Crédito PagBank já vinculado a ${porOrigem.autoInfracao} (${porOrigem.descricao}).`,
        registroExistente: resumoRegistro(porOrigem),
      };
    }
  }

  const jaPago = buscarPagamentoJaRegistrado(
    input.clienteId,
    input.valor,
    input.dataBr,
    input.horaBr,
    despesas,
  );
  if (jaPago) {
    return {
      status: "pix_ja_registrado",
      motivo: `Pagamento R$ ${input.valor.toFixed(2)} em ${input.dataBr} já registrado (${jaPago.autoInfracao} — ${stripAtrasadoSemanal(jaPago.descricao)}).`,
      registroExistente: resumoRegistro(jaPago),
    };
  }

  if (input.despesaId) {
    const alvoKey = input.despesaId.trim();
    const alvo = listarDespesasIdempotencia(despesas).find(
      (d) => d.ativo !== false && d.id === alvoKey,
    );
    if (alvo?.paga === true) {
      const descQuitada = input.descricaoQuitada
        ? stripAtrasadoSemanal(input.descricaoQuitada).toLowerCase()
        : null;
      const descAlvo = stripAtrasadoSemanal(alvo.descricao).toLowerCase();
      const baixaIntegral =
        !descQuitada ||
        descAlvo === descQuitada ||
        valoresProximos(alvo.valorMulta, input.valor);

      if (baixaIntegral) {
        return {
          status: "alvo_ja_quitado",
          motivo: `Despesa alvo ${input.despesaId} já está quitada (${alvo.descricao}, R$ ${alvo.valorMulta.toFixed(2)}).`,
          registroExistente: resumoRegistro(alvo),
        };
      }
    }
  }

  return { status: "ok", motivo: "Nenhum registro equivalente encontrado." };
}
