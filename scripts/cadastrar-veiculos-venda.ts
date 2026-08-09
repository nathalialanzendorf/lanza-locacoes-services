import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { compactPlaca, formatPlacaHyphen, placasIguais } from "../src/lib/placa.js";

const DB_PATH = path.join(process.cwd(), "database", "veiculos.json");

type VeiculoVendaInput = {
  dono: string;
  placa: string;
  marca: string;
  modelo: string;
  anoModelo: string;
  renavam: string;
  documento: string;
  cor?: string;
};

const VEICULOS: VeiculoVendaInput[] = [
  {
    dono: "Ramon",
    placa: "IOK3H21",
    marca: "Chevrolet",
    modelo: "Montana 1.4",
    cor: "Vermelha",
    anoModelo: "2008/2008",
    renavam: "00948255250",
    documento: "43051371000105",
  },
  {
    dono: "Ricardo",
    placa: "MKB8D01",
    marca: "Volkswagen",
    modelo: "Gol 1.0 GIV",
    cor: "Branca",
    anoModelo: "2012/2013",
    renavam: "454027109",
    documento: "04062432552",
  },
  {
    dono: "Venezuelano",
    placa: "MBI0664",
    marca: "GM",
    modelo: "CORSA MILENIUM",
    anoModelo: "2001/2001",
    renavam: "762434040",
    documento: "06598411939",
  },
  {
    dono: "Elton",
    placa: "AJZ1G60",
    marca: "FIAT",
    modelo: "PALIO WEEKEND ELX",
    anoModelo: "2001/2002",
    renavam: "762122676",
    documento: "68283440900",
  },
  {
    dono: "Bruno",
    placa: "NRH5E75",
    marca: "HYUNDAI",
    modelo: "i30 2.0",
    anoModelo: "2011/2012",
    renavam: "373630310",
    documento: "10562102906",
  },
];

type VeiculoJson = Record<string, unknown> & {
  id: string;
  placa: string;
  veiculos?: never;
};

type VeiculosDb = {
  descricao?: string;
  atualizadoEm?: string;
  veiculos: VeiculoJson[];
};

function anoDeAnoModelo(anoModelo: string): number | undefined {
  const m = anoModelo.match(/\/(\d{4})$/);
  return m ? Number(m[1]) : undefined;
}

function upsertVeiculoVenda(db: VeiculosDb, input: VeiculoVendaInput): "novo" | "atualizado" {
  const placa = formatPlacaHyphen(input.placa);
  const idx = db.veiculos.findIndex((v) => placasIguais(String(v.placa), placa));
  const ts = new Date().toISOString();
  const ano = anoDeAnoModelo(input.anoModelo);
  const patch: VeiculoJson = {
    ...(idx >= 0 ? db.veiculos[idx]! : { id: crypto.randomUUID() }),
    placa,
    marca: input.marca,
    modelo: input.modelo,
    marcaModelo: `${input.marca}/${input.modelo}`.replace(/\s+/g, " ").trim(),
    anoModelo: input.anoModelo,
    ano,
    renavam: input.renavam,
    cor: input.cor,
    tipoFrota: "venda",
    particular: false,
    ativo: true,
    origem: "import-venda-estoque",
    proprietarioNome: input.dono,
    proprietarioDocumento: input.documento,
    rastreameLabel: `${input.dono} — ${input.documento}`,
    atualizadoEm: ts,
  };

  if (idx >= 0) {
    db.veiculos[idx] = patch;
    return "atualizado";
  }
  db.veiculos.push(patch);
  return "novo";
}

async function main() {
  const raw = fs.readFileSync(DB_PATH, "utf8");
  const db = JSON.parse(raw) as VeiculosDb;
  const resultados: Array<{ placa: string; acao: string; id: string; dono: string }> = [];

  for (const v of VEICULOS) {
    const acao = upsertVeiculoVenda(db, v);
    const placa = formatPlacaHyphen(v.placa);
    const registro = db.veiculos.find((x) => placasIguais(String(x.placa), placa))!;
    resultados.push({
      placa: String(registro.placa),
      acao,
      id: String(registro.id),
      dono: v.dono,
    });
  }

  db.veiculos.sort((a, b) => compactPlaca(String(a.placa)).localeCompare(compactPlaca(String(b.placa))));
  db.atualizadoEm = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({ total: resultados.length, veiculos: resultados }, null, 2));
}

main().catch((err) => {
  console.error("ERRO:", err);
  process.exit(1);
});
