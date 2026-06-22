/**
 * Varre contratosDir em busca de Contrato*.docx e filtra por interseção
 * com uma semana [inicio, fim] usando data no nome da pasta + duração (dias).
 */
import fs from "node:fs";
import path from "node:path";

const EXCL_PATH =
  /Modelo v3|compra e venda|contrato-compra|Orçamentos|Modelo antigo|\\Copy\\/i;
const EXCL_CLOSED = /devolvido|encerrado|entregue|recolhido/i;

export type ContratoPasta = {
  /** Pasta do contrato (…/DD.MM.AAAA - Cliente/) */
  pastaContrato: string;
  docx: string;
  /** Pasta do veículo (nível acima da pasta datada) */
  pastaVeiculo: string;
  clienteNome: string;
  inicio: Date;
};

function parseDataPasta(nomePasta: string): Date | null {
  const m4 = nomePasta.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*/);
  if (m4) {
    const d = Number(m4[1]);
    const mo = Number(m4[2]);
    const y = Number(m4[3]);
    const dt = new Date(y, mo - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const m2 = nomePasta.match(/^(\d{2})\.(\d{2})\.(\d{2})(?!\d)\s*-\s*/);
  if (m2) {
    const d = Number(m2[1]);
    const mo = Number(m2[2]);
    let yy = Number(m2[3]);
    const y = yy >= 50 ? 1900 + yy : 2000 + yy;
    const dt = new Date(y, mo - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return null;
}

function clienteDaPasta(nomePasta: string): string | null {
  const m = nomePasta.match(/^\d{2}\.\d{2}\.\d{2,4}\s*-\s*(.+)$/);
  return m ? m[1]!.trim() : null;
}

function overlaps(
  ini: Date,
  fim: Date,
  weekStart: Date,
  weekEnd: Date,
): boolean {
  return ini <= weekEnd && fim >= weekStart;
}

/** Percorre `root` e devolve candidatos únicos por `pastaContrato`. */
export function listarContratosAtivosNaSemana(
  root: string,
  weekStart: Date,
  weekEnd: Date,
  prazoDias: number,
): ContratoPasta[] {
  const seen = new Set<string>();
  const out: ContratoPasta[] = [];

  function walk(dir: string): void {
    let ents: fs.Dirent[];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.isFile() && /^Contrato.*\.docx$/i.test(ent.name)) {
        if (EXCL_PATH.test(p) || EXCL_CLOSED.test(p)) continue;
        const pastaContrato = path.dirname(p);
        if (seen.has(pastaContrato)) continue;
        const nomePasta = path.basename(pastaContrato);
        const inicio = parseDataPasta(nomePasta);
        if (!inicio) continue;
        const fim = new Date(inicio);
        fim.setDate(fim.getDate() + prazoDias);
        if (!overlaps(inicio, fim, weekStart, weekEnd)) continue;
        const cliente = clienteDaPasta(nomePasta);
        if (!cliente) continue;
        const pastaVeiculo = path.basename(path.dirname(pastaContrato));
        seen.add(pastaContrato);
        out.push({
          pastaContrato,
          docx: p,
          pastaVeiculo,
          clienteNome: cliente,
          inicio,
        });
      }
    }
  }

  walk(root);
  out.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  return out;
}
