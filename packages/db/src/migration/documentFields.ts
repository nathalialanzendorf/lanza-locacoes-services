import { asText } from "./relationalUtils.js";

export type CrlvFields = {
  crlvArquivo: string | null;
  exercicio: string | null;
  anoFabricacao: number | null;
  numeroCrv: string | null;
  codigoSegurancaCla: string | null;
  especie: string | null;
  placaAnterior: string | null;
  placaAnteriorUf: string | null;
  potenciaCilindrada: string | null;
  pesoBrutoTotal: string | null;
  cmt: string | null;
  lotacao: string | null;
  eixos: string | null;
  carroceria: string | null;
  proprietarioNome: string | null;
  proprietarioDocumento: string | null;
  localEmissao: string | null;
  dataEmissao: string | null;
  observacoes: string | null;
  crlvSyncEm: string | null;
};

function pickNestedOrFlat(
  nested: Record<string, unknown>,
  root: Record<string, unknown>,
  key: string,
  flatKey?: string,
): string | null {
  return asText(nested[key]) ?? asText(root[flatKey ?? key]);
}

function pickAnoFabricacao(nested: Record<string, unknown>, root: Record<string, unknown>): number | null {
  const v = nested.anoFabricacao ?? root.anoFabricacao;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d{4}$/.test(v.trim())) return Number(v.trim());
  const am = asText(nested.anoModelo) ?? asText(root.anoModelo);
  const m = am?.match(/^(\d{4})\//);
  return m ? Number(m[1]) : null;
}

/** Extrai campos CRLV de um registro veículo (objeto aninhado `crlv` ou chaves no topo). */
export function pickCrlvFromVeiculo(v: Record<string, unknown>): CrlvFields | null {
  const nested = (v.crlv as Record<string, unknown> | undefined) ?? {};
  const fields: CrlvFields = {
    crlvArquivo: pickNestedOrFlat(nested, v, "crlvArquivo"),
    exercicio: pickNestedOrFlat(nested, v, "exercicio"),
    anoFabricacao: pickAnoFabricacao(nested, v),
    numeroCrv: pickNestedOrFlat(nested, v, "numeroCrv"),
    codigoSegurancaCla: pickNestedOrFlat(nested, v, "codigoSegurancaCla"),
    especie: pickNestedOrFlat(nested, v, "especie"),
    placaAnterior: pickNestedOrFlat(nested, v, "placaAnterior"),
    placaAnteriorUf: pickNestedOrFlat(nested, v, "placaAnteriorUf"),
    potenciaCilindrada: pickNestedOrFlat(nested, v, "potenciaCilindrada"),
    pesoBrutoTotal: pickNestedOrFlat(nested, v, "pesoBrutoTotal"),
    cmt: pickNestedOrFlat(nested, v, "cmt"),
    lotacao: pickNestedOrFlat(nested, v, "lotacao"),
    eixos: pickNestedOrFlat(nested, v, "eixos"),
    carroceria: pickNestedOrFlat(nested, v, "carroceria"),
    proprietarioNome: pickNestedOrFlat(nested, v, "proprietarioNome"),
    proprietarioDocumento: pickNestedOrFlat(nested, v, "proprietarioDocumento"),
    localEmissao: pickNestedOrFlat(nested, v, "localEmissao"),
    dataEmissao: pickNestedOrFlat(nested, v, "dataEmissao"),
    observacoes: pickNestedOrFlat(nested, v, "observacoes"),
    crlvSyncEm: pickNestedOrFlat(nested, v, "crlvSyncEm"),
  };

  const hasAny = Object.entries(fields).some(([, val]) => val != null && val !== "");
  return hasAny ? fields : null;
}

export type CnhFields = {
  numeroRegistro: string | null;
  categoria: string | null;
  primeiraHabilitacao: string | null;
  dataEmissao: string | null;
  validade: string | null;
  numeroEspelho: string | null;
  orgaoEmissor: string | null;
  ufEmissor: string | null;
  ear: boolean | null;
  observacoes: string | null;
  cnhArquivo: string | null;
};

export function pickCnhFields(
  cnh: Record<string, unknown> | undefined,
  cnhArquivoFallback?: string | null,
): CnhFields | null {
  if (!cnh || !Object.keys(cnh).length) return null;
  return {
    numeroRegistro: asText(cnh.numeroRegistro),
    categoria: asText(cnh.categoria),
    primeiraHabilitacao: asText(cnh.primeiraHabilitacao),
    dataEmissao: asText(cnh.dataEmissao),
    validade: asText(cnh.validade),
    numeroEspelho: asText(cnh.numeroEspelho),
    orgaoEmissor: asText(cnh.orgaoEmissor),
    ufEmissor: asText(cnh.ufEmissor),
    ear: cnh.ear === true || cnh.ear === false ? cnh.ear : cnh.ear === "true" ? true : cnh.ear === "false" ? false : null,
    observacoes: asText(cnh.observacoes),
    cnhArquivo: asText(cnh.cnhArquivo) ?? cnhArquivoFallback ?? null,
  };
}

type QueryFn = (sql: string, params?: unknown[]) => Promise<unknown>;

/** Atualiza campos CRLV inline em `lanza.veiculos` (schema v2). */
export async function upsertVeiculoCrlv(
  query: QueryFn,
  veiculoId: string,
  fields: CrlvFields,
): Promise<void> {
  await query(
    `UPDATE lanza.veiculos SET
      crlv_arquivo = $2, exercicio = $3, ano_fabricacao = $4, numero_crv = $5,
      codigo_seguranca_cla = $6, especie = $7, placa_anterior = $8, placa_anterior_uf = $9,
      potencia_cilindrada = $10, peso_bruto_total = $11, cmt = $12, lotacao = $13, eixos = $14,
      carroceria = $15, proprietario_nome = $16, proprietario_documento = $17, local_emissao = $18,
      data_emissao = $19, crlv_observacoes = $20, crlv_sync_em = $21, atualizado_em = now()
     WHERE id = $1`,
    [
      veiculoId,
      fields.crlvArquivo,
      fields.exercicio,
      fields.anoFabricacao,
      fields.numeroCrv,
      fields.codigoSegurancaCla,
      fields.especie,
      fields.placaAnterior,
      fields.placaAnteriorUf,
      fields.potenciaCilindrada,
      fields.pesoBrutoTotal,
      fields.cmt,
      fields.lotacao,
      fields.eixos,
      fields.carroceria,
      fields.proprietarioNome,
      fields.proprietarioDocumento,
      fields.localEmissao,
      fields.dataEmissao,
      fields.observacoes,
      fields.crlvSyncEm ? new Date(fields.crlvSyncEm) : null,
    ],
  );
}

/** Atualiza campos CNH inline em `lanza.clientes` (schema v2). */
export async function upsertClienteCnh(
  query: QueryFn,
  clienteId: string,
  cnh: CnhFields,
): Promise<void> {
  await query(
    `UPDATE lanza.clientes SET
      cnh_numero_registro = $2, cnh_categoria = $3, cnh_primeira_habilitacao = $4,
      cnh_data_emissao = $5, cnh_validade = $6, cnh_numero_espelho = $7,
      cnh_orgao_emissor = $8, cnh_uf_emissor = $9, cnh_ear = $10, cnh_observacoes = $11,
      cnh_arquivo = COALESCE($12, cnh_arquivo), atualizado_em = now()
     WHERE id = $1`,
    [
      clienteId,
      cnh.numeroRegistro,
      cnh.categoria,
      cnh.primeiraHabilitacao,
      cnh.dataEmissao,
      cnh.validade,
      cnh.numeroEspelho,
      cnh.orgaoEmissor,
      cnh.ufEmissor,
      cnh.ear,
      cnh.observacoes,
      cnh.cnhArquivo,
    ],
  );
}

export function crlvFieldsToJson(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const map: [string, string][] = [
    ["crlvArquivo", "crlv_arquivo"],
    ["exercicio", "exercicio"],
    ["anoFabricacao", "ano_fabricacao"],
    ["numeroCrv", "numero_crv"],
    ["codigoSegurancaCla", "codigo_seguranca_cla"],
    ["especie", "especie"],
    ["placaAnterior", "placa_anterior"],
    ["placaAnteriorUf", "placa_anterior_uf"],
    ["potenciaCilindrada", "potencia_cilindrada"],
    ["pesoBrutoTotal", "peso_bruto_total"],
    ["cmt", "cmt"],
    ["lotacao", "lotacao"],
    ["eixos", "eixos"],
    ["carroceria", "carroceria"],
    ["proprietarioNome", "proprietario_nome"],
    ["proprietarioDocumento", "proprietario_documento"],
    ["localEmissao", "local_emissao"],
    ["dataEmissao", "data_emissao"],
    ["observacoes", "crlv_observacoes"],
    ["crlvSyncEm", "crlv_sync_em"],
  ];
  for (const [jsonKey, sqlCol] of map) {
    const val = row[sqlCol];
    if (val != null && val !== "") out[jsonKey] = val;
  }
  return out;
}
