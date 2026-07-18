import type { Contrato, PrestacaoSugestaoVeiculo, Veiculo } from "@/api/types";

export type GanhoVeiculoLinha = {
  veiculoId: string;
  placa: string;
  valor: number;
  descricao: string;
  itens?: { descricao: string; valor: number }[];
  descontoManutencao?: {
    valor: number;
    descricao: string;
    itens?: { descricao: string; valor: number }[];
  };
  origem: "locacoes" | "contrato";
  contratoCliente?: string;
};

function normPlaca(placa?: string | null): string {
  return (placa ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function somaItens(itens?: { valor: number }[]): number {
  return (itens ?? []).reduce((s, i) => s + (Number(i.valor) || 0), 0);
}

export function contratoVigenteDoVeiculo(
  contratos: Contrato[],
  veiculoId: string,
): Contrato | null {
  const doVeiculo = contratos.filter((c) => c.veiculoId === veiculoId);
  const ativo = doVeiculo.find((c) => c.status === "ativo");
  if (ativo) return ativo;
  return (
    [...doVeiculo].sort((a, b) => (b.dataInicio ?? "").localeCompare(a.dataInicio ?? "", "pt-BR"))[0] ??
    null
  );
}

export function ganhoFromContrato(contrato: Contrato): { valor: number; descricao: string } {
  const placa = contrato.placa ?? "";
  if (normPlaca(placa) === "PWH3A45") {
    return { valor: 1100, descricao: "Locação mensal (Doblo)" };
  }
  const tipo = (contrato.tipoContrato ?? "semanal").toLowerCase();
  if (tipo === "mensal" && contrato.valorMensal != null && contrato.valorMensal > 0) {
    return { valor: contrato.valorMensal, descricao: "Locação mensal (contrato)" };
  }
  if (contrato.valorSemanal != null && contrato.valorSemanal > 0) {
    return {
      valor: Math.round(contrato.valorSemanal * 4 * 100) / 100,
      descricao: `4 semanas × R$ ${contrato.valorSemanal.toLocaleString("pt-BR")} (contrato)`,
    };
  }
  if (contrato.valorMensal != null && contrato.valorMensal > 0) {
    return { valor: contrato.valorMensal, descricao: "Locação mensal (contrato)" };
  }
  if (contrato.valorDiaria != null && contrato.valorDiaria > 0) {
    return {
      valor: Math.round(contrato.valorDiaria * 30 * 100) / 100,
      descricao: `30 diárias × R$ ${contrato.valorDiaria.toLocaleString("pt-BR")} (contrato)`,
    };
  }
  return { valor: 0, descricao: "Sem valor no contrato" };
}

function sugestaoPorPlaca(
  sugestoes: PrestacaoSugestaoVeiculo[],
  placa: string,
): PrestacaoSugestaoVeiculo | undefined {
  const alvo = normPlaca(placa);
  return sugestoes.find((s) => normPlaca(s.placa) === alvo);
}

export function calcularGanhosVeiculos(opts: {
  veiculos: Veiculo[];
  selecionados: Set<string>;
  contratos: Contrato[];
  sugestoes?: PrestacaoSugestaoVeiculo[];
}): GanhoVeiculoLinha[] {
  const linhas: GanhoVeiculoLinha[] = [];

  for (const v of opts.veiculos) {
    if (!opts.selecionados.has(v.id) || !v.placa?.trim()) continue;

    const sugestao = sugestaoPorPlaca(opts.sugestoes ?? [], v.placa);
    const ganhoLoc = somaItens(sugestao?.ganhoItens);
    const descontoLoc = somaItens(sugestao?.manutencaoItens);

    if (ganhoLoc > 0 || (sugestao?.ganhoItens?.length ?? 0) > 0) {
      linhas.push({
        veiculoId: v.id,
        placa: v.placa,
        valor: ganhoLoc,
        descricao:
          sugestao!.ganhoItens!.length === 1
            ? sugestao!.ganhoItens![0]!.descricao
            : `Locação no período (${sugestao!.ganhoItens!.length} linhas)`,
        itens: sugestao!.ganhoItens,
        descontoManutencao:
          descontoLoc > 0
            ? {
                valor: descontoLoc,
                descricao: "Manutenção no período",
                itens: sugestao!.manutencaoItens,
              }
            : undefined,
        origem: "locacoes",
      });
      continue;
    }

    const contrato = contratoVigenteDoVeiculo(opts.contratos, v.id);
    const ganho = contrato ? ganhoFromContrato(contrato) : { valor: 0, descricao: "Sem contrato" };
    linhas.push({
      veiculoId: v.id,
      placa: v.placa,
      valor: ganho.valor,
      descricao: ganho.descricao,
      origem: "contrato",
      contratoCliente: contrato?.clienteNome ?? undefined,
    });
  }

  return linhas.sort((a, b) => a.placa.localeCompare(b.placa, "pt-BR"));
}
