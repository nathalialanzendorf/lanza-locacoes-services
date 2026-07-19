/**
 * Monta o relatório global de infrações agrupado por tipo (blocos/subgrupos)
 * a partir de database/infracoes.json — mesmo shape de _infracoes_canvas_data.json.
 */
import fs from "node:fs";
import path from "node:path";

import { loadClientesDb } from "./clientesDb.js";
import { loadClienteDespesasDb, type ClienteDespesaRegistro } from "./clienteDespesasDb.js";
import { loadCobrancasDbContextAsync } from "./cobrancasDbContext.js";
import { parseDataInicio } from "./inicioLocacoes.js";
import { parseDataAutuacao } from "./inferirCondutorInfracao.js";
import {
  infracaoNaoCobravelDetran,
  infracaoQuitadaDetran,
} from "./infracaoTitulo.js";
import {
  loadInfracoesDb,
  loadInfracoesDbAsync,
  type InfracaoRegistro,
} from "./infracoesDb.js";
import { compactPlaca, formatPlacaHyphen } from "./placa.js";
import { REPO_ROOT } from "./repoRoot.js";
import { loadVeiculosDb, type VeiculoRegistro } from "./veiculosDb.js";
import { loadJsonDocumentForApi } from "@lanza/db";

export type LinhaInfracaoBloco = {
  placa: string;
  numeroAuto: string;
  data: string;
  valor: number;
  descricao: string;
  status: string;
  situacao: string;
  vencimento: string;
  cliente: string;
  motivoCliente: string;
  quitadaDetran: boolean;
  pagaDetran: string;
  pagaLanza: string;
  cobravel: boolean;
  bloco: string;
  subgrupoId: string;
  subgrupoTitulo: string;
};

export type SubgrupoInfracoesBloco = {
  id: string;
  titulo: string;
  qtd: number;
  total: number;
  linhas: LinhaInfracaoBloco[];
};

export type BlocoInfracoesRelatorio = {
  id: string;
  titulo: string;
  descricao: string;
  qtd: number;
  total: number;
  subgrupos: SubgrupoInfracoesBloco[];
};

export type RelatorioInfracoesBlocosDados = {
  titulo: string;
  geradoEmBr: string;
  fonte: string;
  totalInfracoes: number;
  totalPlacas: number;
  totalGeral: number;
  totalCobravel: number;
  blocos: BlocoInfracoesRelatorio[];
};

type BlocoDef = {
  id: string;
  titulo: string;
  descricao: string;
  subgrupos: Array<{ id: string; titulo: string }>;
};

const BLOCOS: BlocoDef[] = [
  {
    id: "cliente",
    titulo: "Com locatário vinculado",
    descricao: "Infrações com cliente identificado em clientes.json — cobráveis do locatário.",
    subgrupos: [
      { id: "cobravel-aberto", titulo: "Cobrável em aberto" },
      { id: "paga-lanza", titulo: "Paga à Lanza" },
    ],
  },
  {
    id: "parceiro",
    titulo: "Débito do parceiro",
    descricao:
      "Veículo particular do dono ou multa com confirmação manual de débito do parceiro.",
    subgrupos: [{ id: "sem-locatario", titulo: "Confirmado — débito do parceiro" }],
  },
  {
    id: "pendente",
    titulo: "Sem vínculo / revisão",
    descricao:
      "Locatário não identificado · anterior ao início da locação · cliente não cadastrado · sem contrato na data.",
    subgrupos: [
      { id: "nao-identificado", titulo: "Locatário não identificado (revisar)" },
      { id: "anterior-locacao", titulo: "Anterior ao início da locação" },
      { id: "cliente-faltando", titulo: "Cliente não cadastrado" },
      { id: "sem-contrato", titulo: "Sem contrato/locação na data" },
    ],
  },
  {
    id: "historico",
    titulo: "Histórico DETRAN",
    descricao: "Quitada no DETRAN · não cobrável (advertida/justificada).",
    subgrupos: [
      { id: "quitada-detran", titulo: "Quitada no DETRAN" },
      { id: "nao-cobravel", titulo: "Não cobrável (advertida/justificada)" },
    ],
  },
];

function hojeBr(): string {
  const n = new Date();
  return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
}

function brlFmt(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function vencimentoBr(reg: InfracaoRegistro): string {
  for (const c of [reg.dataVencimentoOriginal, reg.dataLimiteDefesa, reg.limiteDefesa]) {
    const m = String(c ?? "").trim().match(/^(\d{2}\/\d{2}\/\d{4})/);
    if (m) return m[1]!;
  }
  return "—";
}

function statusExibicao(reg: InfracaoRegistro): string {
  const s = String(reg.status ?? "").trim();
  if (s) return s;
  if (reg.quitadaDetran) return "Quitada DETRAN";
  return "—";
}

function mapaPagasLanza(): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const d of loadClienteDespesasDb().clienteDespesas ?? []) {
    if (d.ativo === false) continue;
    const auto = String(d.numeroAuto ?? d.autoInfracao ?? "").trim().toUpperCase();
    if (!auto) continue;
    if (d.paga === true) map.set(auto, true);
  }
  return map;
}

function nomeCliente(condutorId: string | null, clientes: Map<string, string>): string {
  if (!condutorId) return "—";
  return clientes.get(condutorId) ?? "—";
}

function loadParceirosNomes(): {
  porPlaca: Map<string, string>;
  porId: Map<string, string>;
} {
  const porPlaca = new Map<string, string>();
  const porId = new Map<string, string>();
  try {
    const parceirosRaw = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "database", "parceiros.json"), "utf8"),
    ) as { parceiros?: Array<{ id: string; nome: string }> };
    const vinculosRaw = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "database", "parceiro-veiculo.json"), "utf8"),
    ) as { vinculos?: Array<{ veiculoId: string; parceiroId: string }> };
    const nomePorId = new Map(
      (parceirosRaw.parceiros ?? []).map((p) => [p.id, p.nome] as const),
    );
    for (const [id, nome] of nomePorId) porId.set(id, nome);
    const parceiroPorVeiculo = new Map(
      (vinculosRaw.vinculos ?? []).map(
        (v) => [v.veiculoId, nomePorId.get(v.parceiroId) ?? ""] as const,
      ),
    );
    for (const v of loadVeiculosDb().veiculos ?? []) {
      const nome = parceiroPorVeiculo.get(v.id);
      if (nome) porPlaca.set(compactPlaca(v.placa), nome);
    }
  } catch {
    /* parceiro opcional no relatório */
  }
  return { porPlaca, porId };
}

function nomeParceiroDebito(
  reg: InfracaoRegistro,
  parceiros: { porPlaca: Map<string, string>; porId: Map<string, string> },
  placaNorm: string,
): string {
  const id = reg.debitoParceiroId?.trim();
  if (id) {
    const nome = parceiros.porId.get(id);
    if (nome) return `Parceiro ${nome}`;
  }
  const porPlaca = parceiros.porPlaca.get(placaNorm);
  return porPlaca ? `Parceiro ${porPlaca}` : "Parceiro";
}

function loadVeiculoParticularPorPlaca(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const v of loadVeiculosDb().veiculos ?? []) {
    if (v.particular === true) out.set(compactPlaca(v.placa), true);
  }
  return out;
}

function debitoParceiroNoRelatorio(
  reg: InfracaoRegistro,
  placaNorm: string,
  particulares: Map<string, boolean>,
): boolean {
  if (reg.condutorId) return false;
  if (reg.debitoParceiroConfirmado === true) return true;
  return particulares.get(placaNorm) === true;
}

function classificarInfracao(
  reg: InfracaoRegistro,
  inicioMap: Map<string, Date>,
  pagasLanza: Map<string, boolean>,
  clientes: Map<string, string>,
  parceiros: { porPlaca: Map<string, string>; porId: Map<string, string> },
  particulares: Map<string, boolean>,
): { bloco: string; subgrupoId: string; motivoCliente: string; cliente: string; cobravel: boolean; pagaLanza: string } {
  const placaNorm = compactPlaca(reg.veiculoId);

  if (infracaoQuitadaDetran(reg)) {
    return {
      bloco: "historico",
      subgrupoId: "quitada-detran",
      motivoCliente: "Quitada no DETRAN (histórico)",
      cliente: "—",
      cobravel: false,
      pagaLanza: "Não",
    };
  }

  if (infracaoNaoCobravelDetran(reg)) {
    return {
      bloco: "historico",
      subgrupoId: "nao-cobravel",
      motivoCliente: "Não cobrável (advertida/justificada)",
      cliente: "—",
      cobravel: false,
      pagaLanza: "Não",
    };
  }

  if (reg.condutorId) {
    const auto = reg.numeroAuto.trim().toUpperCase();
    const paga = pagasLanza.get(auto) === true;
    return {
      bloco: "cliente",
      subgrupoId: paga ? "paga-lanza" : "cobravel-aberto",
      motivoCliente: "",
      cliente: nomeCliente(reg.condutorId, clientes),
      cobravel: true,
      pagaLanza: paga ? "Sim" : "Não",
    };
  }

  if (reg.condutorContrato && !reg.condutorId) {
    const contrato = reg.condutorContrato.trim();
    return {
      bloco: "pendente",
      subgrupoId: "cliente-faltando",
      motivoCliente: `Cliente não cadastrado (contrato: ${contrato})`,
      cliente: `(pendente) ${contrato}`,
      cobravel: false,
      pagaLanza: "Não",
    };
  }

  if (debitoParceiroNoRelatorio(reg, placaNorm, particulares)) {
    return {
      bloco: "parceiro",
      subgrupoId: "sem-locatario",
      motivoCliente: particulares.get(placaNorm)
        ? "Veículo particular — débito do parceiro/dono"
        : "Débito do parceiro confirmado manualmente",
      cliente: nomeParceiroDebito(reg, parceiros, placaNorm),
      cobravel: false,
      pagaLanza: "Não",
    };
  }

  if (reg.condutorNaoIdentificado) {
    return {
      bloco: "pendente",
      subgrupoId: "nao-identificado",
      motivoCliente: "Locatário não identificado — revisar manualmente",
      cliente: "—",
      cobravel: false,
      pagaLanza: "Não",
    };
  }

  const dataAutuacao = parseDataAutuacao(reg.dataAutuacao);
  const inicio = inicioMap.get(placaNorm);
  if (dataAutuacao && inicio && dataAutuacao < inicio) {
    const inicioBr = `${String(inicio.getDate()).padStart(2, "0")}/${String(inicio.getMonth() + 1).padStart(2, "0")}/${inicio.getFullYear()}`;
    return {
      bloco: "pendente",
      subgrupoId: "anterior-locacao",
      motivoCliente: `Anterior ao início da locação (${inicioBr})`,
      cliente: "—",
      cobravel: false,
      pagaLanza: "Não",
    };
  }

  return {
    bloco: "pendente",
    subgrupoId: "sem-contrato",
    motivoCliente: "Sem contrato/locação na data da autuação",
    cliente: "—",
    cobravel: false,
    pagaLanza: reg.revisarManual ? "—" : "Não",
  };
}

function linhaFromRegistro(
  reg: InfracaoRegistro,
  cls: ReturnType<typeof classificarInfracao>,
  subgrupoTitulo: string,
): LinhaInfracaoBloco {
  const pagaDetran = infracaoQuitadaDetran(reg) || infracaoNaoCobravelDetran(reg) ? "Sim" : "Não";
  return {
    placa: formatPlacaHyphen(reg.veiculoId),
    numeroAuto: reg.numeroAuto,
    data: reg.dataAutuacao || "—",
    valor: Number(reg.valorMulta) || Number(reg.valor) || 0,
    descricao: reg.descricao,
    status: statusExibicao(reg),
    situacao: String(reg.situacao ?? "—").trim() || "—",
    vencimento: vencimentoBr(reg),
    cliente: cls.cliente,
    motivoCliente: cls.motivoCliente,
    quitadaDetran: reg.quitadaDetran === true,
    pagaDetran,
    pagaLanza: cls.pagaLanza,
    cobravel: cls.cobravel,
    bloco: cls.bloco,
    subgrupoId: cls.subgrupoId,
    subgrupoTitulo,
  };
}

/** Agrupa todas as infrações ativas de infracoes.json por bloco e subgrupo. */
export function montarRelatorioInfracoesBlocos(): RelatorioInfracoesBlocosDados {
  return montarRelatorioInfracoesBlocosComDados({
    infracoes: loadInfracoesDb().infracoes,
    inicioMap: loadInicioLocacoesMapLocal(loadVeiculosDb().veiculos ?? []),
    pagasLanza: mapaPagasLanzaFromDespesas(loadClienteDespesasDb().clienteDespesas),
    clientes: new Map(loadClientesDb().clientes.map((c) => [c.id, c.nome] as const)),
    parceiros: loadParceirosNomes(),
    particulares: loadVeiculoParticularPorPlaca(),
  });
}

export async function montarRelatorioInfracoesBlocosAsync(): Promise<RelatorioInfracoesBlocosDados> {
  const dbParceiros = path.join(REPO_ROOT, "database", "parceiros.json");
  const dbVinculos = path.join(REPO_ROOT, "database", "parceiro-veiculo.json");
  const [infracoesDb, ctx, parceirosDb, vinculosDb] = await Promise.all([
    loadInfracoesDbAsync(),
    loadCobrancasDbContextAsync(),
    loadJsonDocumentForApi<{ parceiros?: Array<{ id: string; nome: string }> }>(dbParceiros, {
      parceiros: [],
    }),
    loadJsonDocumentForApi<{ vinculos?: Array<{ veiculoId: string; parceiroId: string }> }>(
      dbVinculos,
      { vinculos: [] },
    ),
  ]);
  return montarRelatorioInfracoesBlocosComDados({
    infracoes: infracoesDb.infracoes,
    inicioMap: loadInicioLocacoesMapLocal(ctx.veiculos),
    pagasLanza: mapaPagasLanzaFromDespesas(ctx.clienteDespesas),
    clientes: new Map(ctx.clientes.map((c) => [c.id, c.nome] as const)),
    parceiros: loadParceirosNomesFromData(
      parceirosDb.parceiros ?? [],
      vinculosDb.vinculos ?? [],
      ctx.veiculos,
    ),
    particulares: loadVeiculoParticularPorPlacaFrom(ctx.veiculos),
  });
}

function loadInicioLocacoesMapLocal(veiculos: VeiculoRegistro[]): Map<string, Date> {
  const map = new Map<string, Date>();
  for (const v of veiculos) {
    if (!v.placa) continue;
    const dt = parseDataInicio(v.inicioLocacoes != null ? String(v.inicioLocacoes) : null);
    if (dt) map.set(compactPlaca(v.placa), dt);
  }
  return map;
}

function mapaPagasLanzaFromDespesas(despesas: ClienteDespesaRegistro[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const d of despesas ?? []) {
    if (d.ativo === false) continue;
    const auto = String(d.numeroAuto ?? d.autoInfracao ?? "").trim().toUpperCase();
    if (!auto) continue;
    if (d.paga === true) map.set(auto, true);
  }
  return map;
}

function loadParceirosNomesFromData(
  parceirosRaw: Array<{ id: string; nome: string }>,
  vinculosRaw: Array<{ veiculoId: string; parceiroId: string }>,
  veiculos: VeiculoRegistro[],
): { porPlaca: Map<string, string>; porId: Map<string, string> } {
  const porPlaca = new Map<string, string>();
  const porId = new Map<string, string>();
  const nomePorId = new Map(parceirosRaw.map((p) => [p.id, p.nome] as const));
  for (const [id, nome] of nomePorId) porId.set(id, nome);
  const parceiroPorVeiculo = new Map(
    vinculosRaw.map((v) => [v.veiculoId, nomePorId.get(v.parceiroId) ?? ""] as const),
  );
  for (const v of veiculos) {
    const nome = parceiroPorVeiculo.get(v.id);
    if (nome) porPlaca.set(compactPlaca(v.placa), nome);
  }
  return { porPlaca, porId };
}

function loadVeiculoParticularPorPlacaFrom(veiculos: VeiculoRegistro[]): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const v of veiculos) {
    if (v.particular === true) out.set(compactPlaca(v.placa), true);
  }
  return out;
}

function montarRelatorioInfracoesBlocosComDados(input: {
  infracoes: InfracaoRegistro[];
  inicioMap: Map<string, Date>;
  pagasLanza: Map<string, boolean>;
  clientes: Map<string, string>;
  parceiros: { porPlaca: Map<string, string>; porId: Map<string, string> };
  particulares: Map<string, boolean>;
}): RelatorioInfracoesBlocosDados {
  const { infracoes, inicioMap, pagasLanza, clientes, parceiros, particulares } = input;

  const subgrupoTitulos = new Map<string, string>();
  for (const b of BLOCOS) {
    for (const s of b.subgrupos) {
      subgrupoTitulos.set(`${b.id}:${s.id}`, s.titulo);
    }
  }

  const linhasPorSubgrupo = new Map<string, LinhaInfracaoBloco[]>();
  const placas = new Set<string>();

  for (const reg of infracoes ?? []) {
    if (reg.ativo === false) continue;
    if (!reg.numeroAuto?.trim()) continue;

    placas.add(compactPlaca(reg.veiculoId));
    const cls = classificarInfracao(reg, inicioMap, pagasLanza, clientes, parceiros, particulares);
    const titulo = subgrupoTitulos.get(`${cls.bloco}:${cls.subgrupoId}`) ?? cls.subgrupoId;
    const chave = `${cls.bloco}:${cls.subgrupoId}`;
    const lista = linhasPorSubgrupo.get(chave) ?? [];
    lista.push(linhaFromRegistro(reg, cls, titulo));
    linhasPorSubgrupo.set(chave, lista);
  }

  let totalGeral = 0;
  let totalCobravel = 0;
  let totalInfracoes = 0;

  const blocos: BlocoInfracoesRelatorio[] = BLOCOS.map((b) => {
    const subgrupos: SubgrupoInfracoesBloco[] = b.subgrupos
      .map((s) => {
        const linhas = (linhasPorSubgrupo.get(`${b.id}:${s.id}`) ?? []).sort((a, c) =>
          a.placa.localeCompare(c.placa) ||
          (parseDataAutuacao(a.data)?.getTime() ?? 0) - (parseDataAutuacao(c.data)?.getTime() ?? 0),
        );
        const total = round2(linhas.reduce((sum, l) => sum + l.valor, 0));
        return { id: s.id, titulo: s.titulo, qtd: linhas.length, total, linhas };
      })
      .filter((s) => s.linhas.length > 0);

    const qtd = subgrupos.reduce((n, s) => n + s.qtd, 0);
    const total = round2(subgrupos.reduce((n, s) => n + s.total, 0));
    totalInfracoes += qtd;
    totalGeral += total;
    if (b.id === "cliente") totalCobravel += total;

    return { id: b.id, titulo: b.titulo, descricao: b.descricao, qtd, total, subgrupos };
  }).filter((b) => b.qtd > 0);

  return {
    titulo: "Relatório de infrações",
    geradoEmBr: hojeBr(),
    fonte: "database/infracoes.json",
    totalInfracoes,
    totalPlacas: placas.size,
    totalGeral: round2(totalGeral),
    totalCobravel: round2(totalCobravel),
    blocos,
  };
}

export { brlFmt as formatBrlInfracoesRelatorio };
