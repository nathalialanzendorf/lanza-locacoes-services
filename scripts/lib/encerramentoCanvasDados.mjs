import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function brl(n) {
  return Number(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDataBr(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function linhaDespesa(d) {
  return {
    descricao: d.titulo ?? d.descricao ?? "—",
    placa: d.veiculoId ?? d.placa ?? "—",
    data: d.dataAutuacao ?? d.data ?? "—",
    categoria: d.categoria ?? "—",
    valor: d.valorMulta ?? d.valor ?? 0,
  };
}

function linhaParcela(p) {
  return {
    descricao: p.descricao ?? "—",
    placa: p.placa ?? "—",
    data: p.vencimento ?? p.data ?? "—",
    categoria: p.categoria ?? "Locação semanal",
    valor: p.valorSemanal ?? p.valor ?? 0,
  };
}

function linhaCredito(c) {
  const r = c.registro ?? c;
  return {
    descricao: c.descricao ?? r.descricao ?? "—",
    placa: r.veiculoId ?? "—",
    data: r.dataAutuacao ?? "—",
    categoria: r.categoria ?? "—",
    valor: c.valor ?? r.valorMulta ?? 0,
  };
}

function valorQuebraContrato(j) {
  const quebraDb = (j.debitosDiversos ?? []).find(
    (m) =>
      (m.categoria ?? "") === "Quebra contrato" ||
      /quebra de contrato|reten[cç][aã]o cau[cç][aã]o.*quebra/i.test(m.descricao ?? ""),
  );
  return quebraDb?.valorMulta ?? j.retencaoCaucao ?? 0;
}

function linhaQuebraContrato(j) {
  const c = j.contrato ?? {};
  const valor = valorQuebraContrato(j);
  return (
    `Quebra de contrato (retenção R$ ${brl(valor)}) — retenção proporcional calculada com base em ` +
    `${c.prazoDias ?? 0} dias de contrato e ${j.diasLocacao ?? 0} dias de locação.`
  );
}

function veiculoMeta(placa) {
  try {
    const raw = fs.readFileSync(path.join(REPO_ROOT, "database", "veiculos.json"), "utf8");
    const veiculos = JSON.parse(raw);
    const v = veiculos.find((x) => String(x.placa ?? "").toUpperCase() === String(placa ?? "").toUpperCase());
    if (!v) return { modeloVeiculo: "—", anoModelo: "—" };
    const modelo = [v.marca, v.modelo].filter(Boolean).join("/") || v.descricao || "—";
    const ano = v.anoModelo ?? v.ano ?? "—";
    return { modeloVeiculo: modelo, anoModelo: String(ano) };
  } catch {
    return { modeloVeiculo: "—", anoModelo: "—" };
  }
}

export function encerramentoCanvasDados(j) {
  const c = j.contrato ?? {};
  const placa = c.placa ?? "—";
  const { modeloVeiculo, anoModelo } = veiculoMeta(placa);
  const cliente = String(c.clienteNome ?? j.cliente ?? "—").replace(/\s*\(devolvido.*\)$/i, "").trim();

  return {
    cliente,
    placa,
    modeloVeiculo,
    anoModelo,
    inicio: fmtDataBr(c.inicio) || "—",
    fimPrevisto: fmtDataBr(c.fim) || "—",
    encerramento: j.dataEncerramento ?? "—",
    diasLocacao: j.diasLocacao ?? 0,
    prazoDias: c.prazoDias ?? 0,
    valorSemanal: c.valorSemanal ?? 0,
    valorDiaria: c.valorDiaria ?? 0,
    valorCaucao: c.valorCaucao ?? 0,
    retencaoCaucao: j.retencaoCaucao ?? 0,
    infracoes: (j.infracoes ?? []).map(linhaDespesa),
    totalInfracoes: j.totalInfracoes ?? 0,
    manutencoes: (j.manutencoes ?? []).map(linhaDespesa),
    totalManutencoes: j.totalManutencoes ?? 0,
    parcelasEmAberto: (j.parcelasEmAberto ?? []).map(linhaParcela),
    totalParcelasEmAberto: j.totalParcelasEmAberto ?? 0,
    debitosDiversos: (j.debitosDiversos ?? []).map(linhaDespesa),
    totalDebitosDiversos: j.totalDebitosDiversos ?? 0,
    creditosDevolucao: (j.creditosDevolucao ?? []).map(linhaCredito),
    totalCreditosDevolucao: j.totalCreditosDevolucao ?? 0,
    totalDebitos: j.totalDebitos ?? 0,
    totalCreditos: j.totalCreditos ?? 0,
    saldoFinal: j.saldoFinal ?? 0,
    linhaQuebraContrato: linhaQuebraContrato(j),
    avisos: j.avisos ?? [],
  };
}
