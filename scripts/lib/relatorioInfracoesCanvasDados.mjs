import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const VEICULOS_PATH = path.join(REPO_ROOT, "database", "veiculos.json");

function veiculoPorPlaca() {
  try {
    const db = JSON.parse(fs.readFileSync(VEICULOS_PATH, "utf8"));
    const map = new Map();
    for (const v of db.veiculos ?? []) {
      const key = String(v.placa ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      if (key) map.set(key, v);
    }
    return map;
  } catch {
    return new Map();
  }
}

function infoVeiculo(map, placa) {
  const key = String(placa ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const v = map.get(key);
  return {
    modelo: v?.marcaModelo ?? v?.modelo ?? "",
    ano: v?.anoModelo ?? (v?.ano != null ? String(v.ano) : ""),
  };
}

function mapBlocos(j, veiculos) {
  return (j.blocos ?? []).map((b) => ({
    id: b.id ?? "",
    titulo: b.titulo ?? "",
    descricao: b.descricao ?? "",
    qtd: Number(b.qtd) || 0,
    total: Number(b.total) || 0,
    subgrupos: (b.subgrupos ?? []).map((s) => ({
      id: s.id ?? "",
      titulo: s.titulo ?? "",
      qtd: Number(s.qtd) || 0,
      total: Number(s.total) || 0,
      linhas: (s.linhas ?? []).map((l) => {
        const { modelo, ano } = infoVeiculo(veiculos, l.placa);
        return {
          placa: l.placa ?? "",
          modelo,
          ano,
          numeroAuto: l.numeroAuto ?? "",
          data: l.data ?? "—",
          valor: Number(l.valor) || 0,
          descricao: l.descricao ?? "",
          status: l.status ?? "—",
          situacao: l.situacao ?? "—",
          vencimento: l.vencimento ?? "—",
          cliente: l.cliente ?? "—",
          motivoCliente: l.motivoCliente ?? "",
          pagaDetran: l.pagaDetran ?? "—",
          pagaLanza: l.pagaLanza ?? "—",
          cobravel: !!l.cobravel,
        };
      }),
    })),
  }));
}

/** Layout completo: blocos por tipo (infracoes.json). */
export function relatorioInfracoesCanvasDados(j) {
  const veiculos = veiculoPorPlaca();
  return {
    titulo: j.titulo ?? "Relatório de infrações",
    geradoEmBr: j.geradoEmBr ?? "",
    fonte: j.fonte ?? "database/infracoes.json",
    totalInfracoes: Number(j.totalInfracoes) || 0,
    totalPlacas: Number(j.totalPlacas) || 0,
    totalGeral: Number(j.totalGeral) || 0,
    totalCobravel: Number(j.totalCobravel) || 0,
    blocos: mapBlocos(j, veiculos),
  };
}

export function relatorioInfracoesResumidoCanvasDados(j) {
  const blocos = (j.blocos ?? []).map((b) => ({
    id: b.id ?? "",
    titulo: b.titulo ?? "",
    qtd: Number(b.qtd) || 0,
    total: Number(b.total) || 0,
    grupos: (b.grupos ?? []).map((g) => ({
      titulo: g.titulo ?? "",
      contratoPlaca: g.contratoPlaca ?? undefined,
      contratoMarcaModelo: g.contratoMarcaModelo ?? undefined,
      subtitulo: g.subtitulo ?? undefined,
      linhas: (g.linhas ?? []).map((l) => ({
        auto: l.auto ?? "",
        titulo: l.titulo ?? "",
        descricao: l.descricao ?? "",
        placa: l.placa ?? "",
        data: l.data ?? "—",
        situacao: l.situacao ?? "Em aberto",
        valor: Number(l.valor) || 0,
      })),
      total: Number(g.total) || 0,
    })),
  }));

  // Compatibilidade com sidecars antigos (só `grupos` no topo).
  if (blocos.length === 0 && Array.isArray(j.grupos) && j.grupos.length > 0) {
    blocos.push({
      id: "ativo",
      titulo: "Contrato ativo",
      qtd: j.grupos.reduce((s, g) => s + (g.linhas?.length ?? 0), 0),
      total: Number(j.totalGeral) || 0,
      grupos: j.grupos.map((g) => ({
        titulo: g.titulo ?? "",
        contratoPlaca: g.contratoPlaca ?? undefined,
        contratoMarcaModelo: g.contratoMarcaModelo ?? undefined,
        subtitulo: g.subtitulo ?? undefined,
        linhas: (g.linhas ?? []).map((l) => ({
          auto: l.auto ?? "",
          titulo: l.titulo ?? "",
          descricao: l.descricao ?? "",
          placa: l.placa ?? "",
          data: l.data ?? "—",
          situacao: l.situacao ?? "Em aberto",
          valor: Number(l.valor) || 0,
        })),
        total: Number(g.total) || 0,
      })),
    });
  }

  return {
    titulo: j.titulo ?? "Relatório de infrações (resumido)",
    geradoEmBr: j.geradoEmBr ?? j.dataReferencia ?? "",
    blocos,
    totalGeral: Number(j.totalGeral) || 0,
  };
}
