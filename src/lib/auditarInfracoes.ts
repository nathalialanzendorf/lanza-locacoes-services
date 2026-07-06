import { parseDataAutuacao } from "./inferirCondutorInfracao.js";
import { infracaoNaoCobravelDetran } from "./infracaoTitulo.js";
import { loadInfracoesDb } from "./infracoesDb.js";
import { loadInicioLocacoesMap } from "./inicioLocacoes.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";

export type InfracaoSemCondutor = {
  autoInfracao: string;
  veiculoId: string;
  dataAutuacao: string;
  valorMulta: number;
  descricao: string;
  quitadaDetran: boolean;
  motivo: "sem-condutor" | "sem-data";
};

export type AuditoriaInfracoes = {
  /** Infrações sem locatário na autuação (espelho em parceiro-despesas). */
  semCondutor: InfracaoSemCondutor[];
  /** Sem data de autuação (revisão manual; espelho parceiro se cobrável). */
  semData: InfracaoSemCondutor[];
  /** Ignoradas por serem anteriores ao início das locações do veículo. */
  anterioresLocacao: number;
  /** Placas sem campo inicioLocacoes definido (não dá para filtrar anteriores). */
  placasSemInicio: string[];
};

/**
 * Varre infracoes.json (fonte canônica DETRAN) e lista infrações sem locatário
 * na data da autuação. Desconsidera as anteriores ao início das locações do
 * veículo (campo inicioLocacoes em veiculos.json).
 */
export function auditarInfracoesSemCondutor(placaFiltro?: string): AuditoriaInfracoes {
  const db = loadInfracoesDb();
  const inicioMap = loadInicioLocacoesMap();
  const filtro = placaFiltro ? compactPlaca(placaFiltro) : null;

  const semCondutor: InfracaoSemCondutor[] = [];
  const semData: InfracaoSemCondutor[] = [];
  let anterioresLocacao = 0;
  const placasSemInicio = new Set<string>();

  for (const r of db.infracoes ?? []) {
    if (r.ativo === false) continue;
    if (infracaoNaoCobravelDetran(r)) continue;
    if (r.condutorId) continue;
    if (!r.condutorNaoIdentificado && r.condutorConfirmado && r.condutorContrato) continue;
    const placaNorm = compactPlaca(r.veiculoId);
    if (filtro && placaNorm !== filtro) continue;

    const base: InfracaoSemCondutor = {
      autoInfracao: r.numeroAuto,
      veiculoId: formatPlacaHyphen(r.veiculoId),
      dataAutuacao: r.dataAutuacao || "(sem data)",
      valorMulta: Number(r.valorMulta) || 0,
      descricao: r.descricao,
      quitadaDetran: r.quitadaDetran === true,
      motivo: "sem-condutor",
    };

    if (r.revisarManual || !parseDataAutuacao(r.dataAutuacao)) {
      semData.push({ ...base, motivo: "sem-data" });
      continue;
    }

    const data = parseDataAutuacao(r.dataAutuacao)!;
    const inicio = inicioMap.get(placaNorm);
    if (inicio && data < inicio) {
      anterioresLocacao++;
      continue;
    }
    if (!inicio) placasSemInicio.add(formatPlacaHyphen(r.veiculoId));

    if (r.condutorNaoIdentificado) semCondutor.push(base);
  }

  semCondutor.sort(
    (a, b) =>
      a.veiculoId.localeCompare(b.veiculoId) ||
      (parseDataAutuacao(a.dataAutuacao)?.getTime() ?? 0) -
        (parseDataAutuacao(b.dataAutuacao)?.getTime() ?? 0),
  );

  return {
    semCondutor,
    semData,
    anterioresLocacao,
    placasSemInicio: [...placasSemInicio].sort(),
  };
}

/** Imprime o resultado da varredura de forma legível. */
export function printAuditoriaInfracoes(a: AuditoriaInfracoes): void {
  const total = a.semCondutor.reduce((s, x) => s + x.valorMulta, 0);
  console.log(
    `\n── Varredura: infrações SEM locatário (parceiro-despesas) ──` +
      `\n  sem contrato na autuação: ${a.semCondutor.length} (R$ ${total.toFixed(2)})` +
      ` | sem data (revisar): ${a.semData.length}` +
      ` | ignoradas (antes da locação): ${a.anterioresLocacao}`,
  );
  if (a.placasSemInicio.length) {
    console.log(
      `  ⚠ sem inicioLocacoes em veiculos.json (não dá p/ filtrar anteriores): ${a.placasSemInicio.join(", ")}`,
    );
  }
  for (const i of a.semCondutor) {
    console.log(
      `  • ${i.autoInfracao} | ${i.veiculoId} | ${i.dataAutuacao} | R$ ${i.valorMulta.toFixed(2)}${i.quitadaDetran ? " | QUITADA DETRAN" : ""}`,
    );
    console.log(`      ${i.descricao}`);
  }
}
