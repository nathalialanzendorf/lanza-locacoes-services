import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { PostgresPool } from "../client/PostgresPool.js";
import { DATABASE_DIR } from "../paths.js";
import {
  pickCnhFields,
  pickCrlvFromVeiculo,
  upsertClienteCnh,
  upsertVeiculoCrlv,
} from "./documentFields.js";
import {
  asBool,
  asNumber,
  asText,
  compactPlaca,
  formatPlacaHyphen,
  isUuid,
  normCpf,
  parseIso,
} from "./relationalUtils.js";

export type RelationalImportResult = {
  imported: string[];
  skipped: string[];
  counts: Record<string, { json: number; sql: number }>;
  warnings: string[];
};

export type RelationalImportOptions = {
  dryRun?: boolean;
  stores?: readonly string[];
  databaseDir?: string;
};

type PlacaMap = Map<string, string>;

function readJson<T>(databaseDir: string, file: string): T | null {
  const full = path.join(databaseDir, file);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8")) as T;
}

function resolveVeiculoId(
  ref: string | null | undefined,
  placaMap: PlacaMap,
  warnings: string[],
): string | null {
  if (!ref) return null;
  if (isUuid(ref)) return ref;
  const norm = compactPlaca(ref);
  const id = placaMap.get(norm);
  if (!id) warnings.push(`Placa sem veículo cadastrado: ${ref}`);
  return id ?? null;
}

function mapAnaliseCadastroStatus(alerta: boolean, status: string | null): string {
  if (alerta) return "reprovado";
  if (status && ["assistido", "pendente", "erro", "pulado"].includes(status)) return "inconclusivo";
  return "aprovado";
}

export class JsonToRelationalImporter {
  private readonly placaMap: PlacaMap = new Map();
  private readonly warnings: string[] = [];
  /** cliente_vinculado_id aplicado após importar clientes (evita FK circular). */
  private readonly pendingClienteVinculado: Map<string, string> = new Map();
  /** contrato_anterior_id aplicado após inserir todos os contratos. */
  private readonly pendingContratoAnterior: Map<string, string> = new Map();

  constructor(
    private readonly pool: PostgresPool,
    private readonly databaseDir: string = DATABASE_DIR,
  ) {}

  async importAll(options: RelationalImportOptions = {}): Promise<RelationalImportResult> {
    const stores = options.stores?.length
      ? options.stores
      : [
          "parceiros",
          "veiculos",
          "clientes",
          "parceiro_veiculo",
          "contratos",
          "locacoes",
          "infracoes",
          "cliente_despesas",
          "parceiro_despesas",
          "triagens",
          "cliente_analise",
        ];

    const imported: string[] = [];
    const skipped: string[] = [];
    const counts: Record<string, { json: number; sql: number }> = {};
    const dryRun = options.dryRun ?? false;
    const dir = options.databaseDir ?? this.databaseDir;

    const run = async (name: string, fn: () => Promise<number>): Promise<void> => {
      if (!stores.includes(name)) return;
      const n = await fn();
      counts[name] = { json: n, sql: dryRun ? 0 : n };
      imported.push(name);
    };

    if (stores.includes("parceiros")) {
      await run("parceiros", () => this.importParceiros(dir, dryRun));
    } else skipped.push("parceiros");

    if (stores.includes("veiculos")) {
      await run("veiculos", () => this.importVeiculos(dir, dryRun));
    } else skipped.push("veiculos");

    if (stores.includes("clientes")) {
      await run("clientes", () => this.importClientes(dir, dryRun));
      if (!dryRun && this.pendingClienteVinculado.size > 0) {
        await this.linkVeiculosClientes();
      }
    } else skipped.push("clientes");

    if (stores.includes("parceiro_veiculo")) {
      await run("parceiro_veiculo", () => this.importParceiroVeiculo(dir, dryRun));
    } else skipped.push("parceiro_veiculo");

    if (stores.includes("contratos")) {
      await run("contratos", () => this.importContratos(dir, dryRun));
      if (!dryRun && this.pendingContratoAnterior.size > 0) {
        await this.linkContratosAnteriores();
      }
    } else skipped.push("contratos");

    if (stores.includes("locacoes")) {
      await run("locacoes", () => this.importLocacoes(dir, dryRun));
    } else skipped.push("locacoes");

    if (stores.includes("infracoes")) {
      await run("infracoes", () => this.importInfracoes(dir, dryRun));
    } else skipped.push("infracoes");

    if (stores.includes("cliente_despesas")) {
      await run("cliente_despesas", () => this.importClienteDespesas(dir, dryRun));
    } else skipped.push("cliente_despesas");

    if (stores.includes("parceiro_despesas")) {
      await run("parceiro_despesas", () => this.importParceiroDespesas(dir, dryRun));
    } else skipped.push("parceiro_despesas");

    if (stores.includes("triagens")) {
      await run("triagens", () => this.importTriagens(dir, dryRun));
    } else skipped.push("triagens");

    if (stores.includes("cliente_analise")) {
      await run("cliente_analise", () => this.importClienteAnalise(dir, dryRun));
    } else skipped.push("cliente_analise");

    return { imported, skipped, counts, warnings: [...this.warnings] };
  }

  private async importParceiros(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ parceiros?: Record<string, unknown>[] }>(dir, "parceiros.json");
    const items = db?.parceiros ?? [];
    if (dryRun) return items.length;

    for (const p of items) {
      const id = asText(p.id) ?? randomUUID();
      await this.pool.query(
        `INSERT INTO lanza.parceiros (id, nome, ativo, atualizado_em)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET
           nome = EXCLUDED.nome, ativo = EXCLUDED.ativo, atualizado_em = now()`,
        [id, asText(p.nome) ?? "?", asBool(p.ativo, true)],
      );
    }
    return items.length;
  }

  private async importVeiculos(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ veiculos?: Record<string, unknown>[] }>(dir, "veiculos.json");
    const items = db?.veiculos ?? [];
    if (dryRun) {
      for (const v of items) {
        const placa = asText(v.placa);
        if (placa) this.placaMap.set(compactPlaca(placa), asText(v.id) ?? randomUUID());
      }
      return items.length;
    }

    for (const v of items) {
      const id = asText(v.id) ?? randomUUID();
      const placa = formatPlacaHyphen(asText(v.placa) ?? "");
      const placaNorm = compactPlaca(placa);
      this.placaMap.set(placaNorm, id);

      await this.pool.query(
        `INSERT INTO lanza.veiculos (
          id, placa, placa_norm, marca_modelo, marca, modelo, ano_modelo, ano, chassi, renavam, cor,
          combustivel, categoria, tipo, licenca_ima, vencimento_documento, uf_registro,
          rastreame_rastreavel_key, rastreame_label, rastreame_sync_em,
          cliente_vinculado_id, inicio_locacoes, ativo, particular, origem, atualizado_em
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,now()
        )
        ON CONFLICT (id) DO UPDATE SET
          placa = EXCLUDED.placa, placa_norm = EXCLUDED.placa_norm,
          marca_modelo = EXCLUDED.marca_modelo, marca = EXCLUDED.marca, modelo = EXCLUDED.modelo,
          ano_modelo = EXCLUDED.ano_modelo, ano = EXCLUDED.ano, chassi = EXCLUDED.chassi,
          renavam = EXCLUDED.renavam, cor = EXCLUDED.cor, ativo = EXCLUDED.ativo,
          inicio_locacoes = EXCLUDED.inicio_locacoes, atualizado_em = now()`,
        [
          id,
          placa,
          placaNorm,
          asText(v.marcaModelo),
          asText(v.marca),
          asText(v.modelo),
          asText(v.anoModelo),
          typeof v.ano === "number" ? v.ano : null,
          asText(v.chassi),
          asText(v.renavam),
          asText(v.cor),
          asText(v.combustivel),
          asText(v.categoria),
          asText(v.tipo),
          asText(v.licencaIma),
          asText(v.vencimentoDocumento),
          asText(v.ufRegistro),
          v.rastreameRastreavelKey != null ? String(v.rastreameRastreavelKey) : null,
          asText(v.rastreameLabel),
          parseIso(asText(v.rastreameSyncEm)),
          null,
          asText(v.inicioLocacoes),
          asBool(v.ativo, true),
          asBool(v.particular, false),
          asText(v.origem),
        ],
      );

      const refMes = asText(v.fipeReferencia) ?? "importado";
      if (asText(v.fipeCodigo) || asText(v.fipe) || asText(v.fipeModelo)) {
        await this.pool.query(
          `INSERT INTO lanza.veiculo_fipe (
            id, veiculo_id, code_fipe, modelo, valor_texto, referencia_mes, fipe_url, origem, ativo, cadastrado_em, atualizado_em
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,now(),now())
          ON CONFLICT (veiculo_id, referencia_mes) DO UPDATE SET
            code_fipe = EXCLUDED.code_fipe, modelo = EXCLUDED.modelo, valor_texto = EXCLUDED.valor_texto,
            fipe_url = EXCLUDED.fipe_url, atualizado_em = now()`,
          [
            randomUUID(),
            id,
            asText(v.fipeCodigo) ?? id,
            asText(v.fipeModelo),
            asText(v.fipeValor),
            refMes,
            asText(v.fipe),
            asText(v.origem) ?? "json-import",
          ],
        );
      }

      const clienteVinculadoId = asText(v.clienteVinculadoId);
      if (clienteVinculadoId && isUuid(clienteVinculadoId)) {
        this.pendingClienteVinculado.set(id, clienteVinculadoId);
      }

      const crlv = pickCrlvFromVeiculo(v);
      if (crlv) {
        await upsertVeiculoCrlv((sql, params) => this.pool.query(sql, params), id, crlv);
      }
    }
    return items.length;
  }

  private async linkVeiculosClientes(): Promise<void> {
    for (const [veiculoId, clienteId] of this.pendingClienteVinculado) {
      const r = await this.pool.query(
        `UPDATE lanza.veiculos SET cliente_vinculado_id = $2, atualizado_em = now()
         WHERE id = $1 AND EXISTS (SELECT 1 FROM lanza.clientes WHERE id = $2)`,
        [veiculoId, clienteId],
      );
      if (!r.rowCount) {
        this.warnings.push(`cliente_vinculado_id ignorado (cliente inexistente): veículo ${veiculoId} → ${clienteId}`);
      }
    }
  }

  private async importParceiroVeiculo(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ vinculos?: Record<string, unknown>[] }>(dir, "parceiro-veiculo.json");
    const items = db?.vinculos ?? [];
    if (dryRun) return items.length;

    for (const v of items) {
      const id = asText(v.id) ?? randomUUID();
      const veiculoId = resolveVeiculoId(asText(v.veiculoId), this.placaMap, this.warnings);
      const parceiroId = asText(v.parceiroId);
      if (!veiculoId || !parceiroId) continue;

      await this.pool.query(
        `INSERT INTO lanza.parceiro_veiculo_vinculos (id, parceiro_id, veiculo_id, atualizado_em)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET parceiro_id = EXCLUDED.parceiro_id, veiculo_id = EXCLUDED.veiculo_id, atualizado_em = now()`,
        [id, parceiroId, veiculoId],
      );
    }
    return items.length;
  }

  private async importClientes(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ clientes?: Record<string, unknown>[] }>(dir, "clientes.json");
    const items = db?.clientes ?? [];
    if (dryRun) return items.length;

    for (const c of items) {
      const id = asText(c.id) ?? randomUUID();
      const cpf = asText(c.cpf);
      const cpfNorm = normCpf(cpf);

      await this.pool.query(
        `INSERT INTO lanza.clientes (
          id, nome, cpf, cpf_norm, rg, rg_orgao_expedidor, data_nascimento, local_nascimento,
          filiacao, telefone, email, cnh_arquivo, pasta_contrato_origem, origem_importacao,
          rastreame_motorista_key, rastreame_motorista_id, rastreame_sync_em, ativo, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
        ON CONFLICT (id) DO UPDATE SET
          nome = EXCLUDED.nome, cpf = EXCLUDED.cpf, cpf_norm = EXCLUDED.cpf_norm,
          telefone = EXCLUDED.telefone, email = EXCLUDED.email, ativo = EXCLUDED.ativo, atualizado_em = now()`,
        [
          id,
          asText(c.nome) ?? "?",
          cpf,
          cpfNorm,
          asText(c.rg),
          asText(c.rgOrgaoExpedidor),
          asText(c.dataNascimento),
          asText(c.localNascimento),
          asText(c.filiacao),
          asText(c.telefone),
          asText(c.email),
          asText(c.cnhArquivo),
          asText(c.pastaContratoOrigem),
          asText(c.origemImportacao),
          c.rastreameMotoristaKey != null ? String(c.rastreameMotoristaKey) : null,
          c.rastreameMotoristaId != null ? String(c.rastreameMotoristaId) : null,
          parseIso(asText(c.rastreameSyncEm)),
          asBool(c.ativo, true),
        ],
      );

      const cnh = c.cnh as Record<string, unknown> | undefined;
      const cnhFields = pickCnhFields(cnh, asText(c.cnhArquivo));
      if (cnhFields) {
        await upsertClienteCnh((sql, params) => this.pool.query(sql, params), id, cnhFields);
      }

      const end = c.endereco as Record<string, unknown> | undefined;
      if (end && Object.keys(end).length) {
        await this.pool.query(
          `INSERT INTO lanza.cliente_enderecos (
            cliente_id, cep, logradouro, numero, complemento, bairro, cidade, uf, atualizado_em
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
          ON CONFLICT (cliente_id) DO UPDATE SET
            cep = EXCLUDED.cep, logradouro = EXCLUDED.logradouro, cidade = EXCLUDED.cidade, uf = EXCLUDED.uf, atualizado_em = now()`,
          [
            id,
            asText(end.cep),
            asText(end.logradouro),
            asText(end.numero),
            asText(end.complemento),
            asText(end.bairro),
            asText(end.cidade),
            asText(end.uf),
          ],
        );
      }

      const analise = c.analiseCadastro as Record<string, unknown> | undefined;
      if (analise && Object.keys(analise).length) {
        await this.pool.query(
          `UPDATE lanza.clientes SET
            analise_aprovado = $2, analise_avaliado_em = $3, atualizado_em = now()
           WHERE id = $1`,
          [
            id,
            analise.aprovado === true || analise.aprovado === false ? analise.aprovado : null,
            parseIso(asText(analise.avaliadoEm)),
          ],
        );
      }
    }
    return items.length;
  }

  private async importContratos(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ contratos?: Record<string, unknown>[] }>(dir, "contratos.json");
    const items = db?.contratos ?? [];
    if (dryRun) return items.length;

    for (const c of items) {
      const id = asText(c.id) ?? randomUUID();
      const veiculoRef = asText(c.veiculoId) ?? asText(c.placa) ?? "";
      const veiculoId = resolveVeiculoId(veiculoRef, this.placaMap, this.warnings);
      const placa = formatPlacaHyphen(asText(c.placa) ?? veiculoRef);

      const contratoAnteriorId = asText(c.contratoAnteriorId);
      if (contratoAnteriorId && isUuid(contratoAnteriorId)) {
        this.pendingContratoAnterior.set(id, contratoAnteriorId);
      }

      await this.pool.query(
        `INSERT INTO lanza.contratos (
          id, versao, contrato_anterior_id, cliente_id, veiculo_id,
          pasta_contrato, data_inicio, data_fim_prevista,
          data_encerramento, quebra_contrato, motivo_encerramento, status, prazo_dias,
          tipo_contrato, dia_pagamento_semana, dia_pagamento_mes, dia_pagamento_texto,
          valor_semanal, valor_mensal, valor_diaria, valor_caucao,
          cadastrado_em, atualizado_em
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          COALESCE($22::timestamptz, now()), COALESCE($23::timestamptz, now())
        )
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data_encerramento = EXCLUDED.data_encerramento, atualizado_em = now()`,
        [
          id,
          asNumber(c.versao, 1),
          null,
          isUuid(asText(c.clienteId)) ? c.clienteId : null,
          veiculoId,
          asText(c.pastaContrato),
          asText(c.dataInicio) ?? "",
          asText(c.dataFimPrevista) ?? "",
          asText(c.dataEncerramento),
          asBool(c.quebraContrato, false),
          asText(c.motivoEncerramento),
          asText(c.status) ?? "ativo",
          asNumber(c.prazoDias, 0),
          asText(c.tipoContrato) ?? "semanal",
          asText(c.diaPagamentoSemana),
          typeof c.diaPagamentoMes === "number" ? c.diaPagamentoMes : null,
          asText(c.diaPagamentoTexto),
          c.valorSemanal != null ? asNumber(c.valorSemanal) : null,
          c.valorMensal != null ? asNumber(c.valorMensal) : null,
          c.valorDiaria != null ? asNumber(c.valorDiaria) : null,
          asNumber(c.valorCaucao, 0),
          parseIso(asText(c.cadastradoEm)),
          parseIso(asText(c.atualizadoEm)),
        ],
      );

      const cli = c.cliente as Record<string, unknown> | undefined;
      if (cli) {
        const end = cli.endereco as Record<string, unknown> | undefined;
        const cnh = cli.cnh as Record<string, unknown> | undefined;
        await this.pool.query(
          `INSERT INTO lanza.contrato_cliente_snapshots (
            contrato_id, cliente_ref_id, nome, cpf, rg, telefone, email,
            cnh_categoria, cnh_validade, endereco_cep, endereco_logradouro, endereco_numero,
            endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, atualizado_em
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
          ON CONFLICT (contrato_id) DO UPDATE SET nome = EXCLUDED.nome, cpf = EXCLUDED.cpf, atualizado_em = now()`,
          [
            id,
            isUuid(asText(cli.id)) ? cli.id : null,
            asText(cli.nome) ?? "?",
            asText(cli.cpf),
            asText(cli.rg),
            asText(cli.telefone),
            asText(cli.email),
            cnh ? asText(cnh.categoria) : null,
            cnh ? asText(cnh.validade) : null,
            end ? asText(end.cep) : null,
            end ? asText(end.logradouro) : null,
            end ? asText(end.numero) : null,
            end ? asText(end.complemento) : null,
            end ? asText(end.bairro) : null,
            end ? asText(end.cidade) : null,
            end ? asText(end.uf) : null,
          ],
        );
      }

      const vei = c.veiculo as Record<string, unknown> | undefined;
      if (vei) {
        await this.pool.query(
          `INSERT INTO lanza.contrato_veiculo_snapshots (
            contrato_id, veiculo_ref_id, placa, marca_modelo, fipe_modelo, ano_modelo,
            chassi, renavam, cor, fipe_valor, atualizado_em
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
          ON CONFLICT (contrato_id) DO UPDATE SET placa = EXCLUDED.placa, atualizado_em = now()`,
          [
            id,
            isUuid(asText(vei.id)) ? vei.id : null,
            formatPlacaHyphen(asText(vei.placa) ?? placa),
            asText(vei.marcaModelo),
            asText(vei.fipeModelo),
            asText(vei.anoModelo),
            asText(vei.chassi),
            asText(vei.renavam),
            asText(vei.cor),
            asText(vei.fipeValor),
          ],
        );
      }
    }
    return items.length;
  }

  private async linkContratosAnteriores(): Promise<void> {
    for (const [contratoId, anteriorId] of this.pendingContratoAnterior) {
      const r = await this.pool.query(
        `UPDATE lanza.contratos SET contrato_anterior_id = $2, atualizado_em = now()
         WHERE id = $1 AND EXISTS (SELECT 1 FROM lanza.contratos WHERE id = $2)`,
        [contratoId, anteriorId],
      );
      if (!r.rowCount) {
        this.warnings.push(`contrato_anterior_id ignorado (contrato pai inexistente): ${contratoId} → ${anteriorId}`);
      }
    }
  }

  private async importLocacoes(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ locacoes?: Record<string, unknown>[] }>(dir, "locacoes.json");
    const items = db?.locacoes ?? [];
    if (dryRun) return items.length;

    for (const l of items) {
      const id = asText(l.id) ?? randomUUID();
      const placa = formatPlacaHyphen(asText(l.placa) ?? "");
      await this.pool.query(
        `INSERT INTO lanza.locacoes (
          id, veiculo_id, placa, cliente_id, condutor_nome, contrato_id, situacao, inicio, fim,
          tipo_locacao, valor_cobrado, valor_pago, substitui_veiculo_id, substitui_placa, observacao,
          cadastrado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          COALESCE($16::timestamptz, now()), COALESCE($17::timestamptz, now()))
        ON CONFLICT (id) DO UPDATE SET fim = EXCLUDED.fim, situacao = EXCLUDED.situacao, atualizado_em = now()`,
        [
          id,
          resolveVeiculoId(asText(l.veiculoId), this.placaMap, this.warnings),
          placa,
          isUuid(asText(l.clienteId)) ? l.clienteId : null,
          asText(l.condutorNome),
          isUuid(asText(l.contratoId)) ? l.contratoId : null,
          asText(l.situacao) ?? "locado",
          asText(l.inicio) ?? "",
          asText(l.fim),
          asText(l.tipoLocacao),
          l.valorCobrado != null ? asNumber(l.valorCobrado) : null,
          l.valorPago != null ? asNumber(l.valorPago) : null,
          resolveVeiculoId(asText(l.substituiVeiculoId), this.placaMap, this.warnings),
          asText(l.substituiPlaca),
          asText(l.observacao),
          parseIso(asText(l.cadastradoEm)),
          parseIso(asText(l.atualizadoEm)),
        ],
      );
    }
    return items.length;
  }

  private async importInfracoes(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ infracoes?: Record<string, unknown>[] }>(dir, "infracoes.json");
    const items = db?.infracoes ?? [];
    if (dryRun) return items.length;

    for (const i of items) {
      const id = asText(i.id) ?? randomUUID();

      const raw = i.detranRaw as Record<string, unknown> | undefined;
      const complemento = asText(i.complemento) ?? asText(raw?.complemento);
      const senhaDetran = asText(i.senhaDetran) ?? asText(i.senha) ?? asText(raw?.senha);

      await this.pool.query(
        `INSERT INTO lanza.infracoes (
          id, numero_auto, id_auto_infracao, veiculo_id, descricao, data_autuacao,
          data_hora_autuacao, local_infracao, valor, situacao, status, protocolo,
          data_limite_defesa, limite_defesa, prazo_defesa_expirado, data_vencimento_original,
          convertida_em_debito, quitada_detran, status_infracao, status_detran, fonte,
          condutor_id, condutor_confirmado, condutor_contrato, condutor_nao_identificado,
          pdf_arquivo, detran_raw, origem,
          sync_em, ativo, cadastrado_em, atualizado_em,
          complemento, senha_detran, notificacao_pdf_arquivo
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25,$26,$27,$28,$29,$30,
          COALESCE($31::timestamptz, now()), COALESCE($32::timestamptz, now()),
          $33,$34,$35
        )
        ON CONFLICT (id) DO UPDATE SET situacao = EXCLUDED.situacao, valor = EXCLUDED.valor, atualizado_em = now()`,
        [
          id,
          asText(i.numeroAuto) ?? asText(i.autoInfracao) ?? id,
          typeof i.idAutoInfracao === "number" ? i.idAutoInfracao : null,
          resolveVeiculoId(asText(i.veiculoId), this.placaMap, this.warnings),
          asText(i.descricao) ?? "",
          asText(i.dataAutuacao) ?? "",
          asText(i.dataHoraAutuacao),
          asText(i.localInfracao),
          asNumber(i.valor ?? i.valorMulta, 0),
          asText(i.situacao),
          asText(i.status),
          asText(i.protocolo),
          asText(i.dataLimiteDefesa),
          asText(i.limiteDefesa),
          asBool(i.prazoDefesaExpirado, false),
          asText(i.dataVencimentoOriginal),
          asBool(i.convertidaEmDebito, false),
          asBool(i.quitadaDetran, false),
          asText(i.statusInfracao),
          asText(i.statusDetran),
          asText(i.fonte),
          isUuid(asText(i.condutorId)) ? i.condutorId : null,
          asBool(i.condutorConfirmado, false),
          asText(i.condutorContrato),
          asBool(i.condutorNaoIdentificado, false),
          asText(i.pdfArquivo),
          i.detranRaw != null ? (i.detranRaw as object) : null,
          asText(i.origem),
          parseIso(asText(i.syncEm)),
          asBool(i.ativo, true),
          parseIso(asText(i.cadastradoEm)),
          parseIso(asText(i.atualizadoEm)),
          complemento,
          senhaDetran,
          asText(i.notificacaoPdfArquivo),
        ],
      );
    }
    return items.length;
  }

  private async importClienteDespesas(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ clienteDespesas?: Record<string, unknown>[] }>(dir, "cliente-despesas.json");
    const items = db?.clienteDespesas ?? [];
    if (dryRun) return items.length;

    const infracaoMap = new Map<string, string>();
    const infRows = await this.pool.query<{ id: string; numero_auto: string }>(
      "SELECT id, numero_auto FROM lanza.infracoes",
    );
    for (const r of infRows.rows) {
      infracaoMap.set(r.numero_auto.toLowerCase(), r.id);
    }

    for (const d of items) {
      const id = asText(d.id) ?? randomUUID();
      const placa = formatPlacaHyphen(asText(d.veiculoId) ?? "");
      const auto = asText(d.autoInfracao) ?? asText(d.numeroAuto) ?? id;
      const infracaoId = infracaoMap.get(auto.toLowerCase()) ?? null;

      await this.pool.query(
        `INSERT INTO lanza.cliente_despesas (
          id, categoria, veiculo_id, veiculo_placa, auto_infracao, titulo, descricao, numero_auto,
          local_infracao, data_autuacao, valor_multa, situacao, limite_defesa, data_limite_defesa,
          data_vencimento_original, convertida_em_debito, condutor_id, condutor_confirmado,
          condutor_contrato, condutor_nao_identificado, debito_parceiro_confirmado, debito_parceiro_id,
          revisar_manual, revisar_motivo, paga, paga_em, quitada_detran, status_infracao, status_detran,
          rastreame_id, rastreame_motorista_key, rastreame_rastreavel_key, rastreame_data_iso,
          rastreame_tipo, rastreame_sync_em, detran_auto_infracao, pdf_arquivo, infracao_id, ativo,
          origem, cadastrado_em, atualizado_em
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
          $30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
          COALESCE($41::timestamptz, now()), COALESCE($42::timestamptz, now())
        )
        ON CONFLICT (id) DO UPDATE SET paga = EXCLUDED.paga, situacao = EXCLUDED.situacao, atualizado_em = now()`,
        [
          id,
          asText(d.categoria),
          resolveVeiculoId(asText(d.veiculoId), this.placaMap, this.warnings),
          placa,
          auto,
          asText(d.titulo),
          asText(d.descricao) ?? "",
          asText(d.numeroAuto) ?? auto,
          asText(d.localInfracao),
          asText(d.dataAutuacao) ?? "",
          asNumber(d.valorMulta, 0),
          asText(d.situacao),
          asText(d.limiteDefesa),
          asText(d.dataLimiteDefesa),
          asText(d.dataVencimentoOriginal),
          asBool(d.convertidaEmDebito, false),
          isUuid(asText(d.condutorId)) ? d.condutorId : null,
          asBool(d.condutorConfirmado, false),
          asText(d.condutorContrato),
          asBool(d.condutorNaoIdentificado, false),
          asBool(d.debitoParceiroConfirmado, false),
          isUuid(asText(d.debitoParceiroId)) ? d.debitoParceiroId : null,
          asBool(d.revisarManual, false),
          asText(d.revisarMotivo),
          asBool(d.paga, false),
          parseIso(asText(d.pagaEm)),
          asBool(d.quitadaDetran, false),
          asText(d.statusInfracao),
          asText(d.statusDetran),
          d.rastreameId != null ? String(d.rastreameId) : null,
          d.rastreameMotoristaKey != null ? String(d.rastreameMotoristaKey) : null,
          d.rastreameRastreavelKey != null ? String(d.rastreameRastreavelKey) : null,
          parseIso(asText(d.rastreameDataIso)),
          asText(d.rastreameTipo),
          parseIso(asText(d.rastreameSyncEm)),
          asText(d.detranAutoInfracao),
          asText(d.pdfArquivo),
          infracaoId,
          asBool(d.ativo, true),
          asText(d.origem),
          parseIso(asText(d.cadastradoEm)),
          parseIso(asText(d.atualizadoEm)),
        ],
      );
    }
    return items.length;
  }

  private async importParceiroDespesas(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ parceiroDespesas?: Record<string, unknown>[] }>(dir, "parceiro-despesas.json");
    const items = db?.parceiroDespesas ?? [];
    if (dryRun) return items.length;

    for (const d of items) {
      const id = asText(d.id) ?? randomUUID();
      const placa = formatPlacaHyphen(asText(d.placa) ?? asText(d.veiculoId) ?? "");
      await this.pool.query(
        `INSERT INTO lanza.parceiro_despesas (
          id, veiculo_id, placa, categoria, descricao, data, valor, competencia, origem,
          rastreame_manutencao_id, rastreame_sync_em, rastreame_hash, baixa, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
        ON CONFLICT (id) DO UPDATE SET baixa = EXCLUDED.baixa, valor = EXCLUDED.valor, atualizado_em = now()`,
        [
          id,
          resolveVeiculoId(asText(d.veiculoId) ?? placa, this.placaMap, this.warnings),
          placa,
          asText(d.categoria) ?? "Outros",
          asText(d.descricao) ?? "",
          asText(d.data) ?? "",
          asNumber(d.valor, 0),
          asText(d.competencia) ?? "",
          asText(d.origem),
          d.rastreameManutencaoId != null ? String(d.rastreameManutencaoId) : null,
          parseIso(asText(d.rastreameSyncEm)),
          asText(d.rastreameHash),
          asText(d.baixa),
        ],
      );
    }
    return items.length;
  }

  private async importTriagens(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ triagens?: Record<string, unknown>[] }>(dir, "analise-cadastro.json");
    const items = db?.triagens ?? [];
    if (dryRun) return items.length;

    for (const t of items) {
      const triagemId = asText(t.id) ?? randomUUID();
      const cpf = normCpf(asText(t.cpf)) ?? asText(t.cpf) ?? "";
      const dataConsulta = asText(t.dataConsulta) ?? "";
      const clienteId = isUuid(asText(t.clienteId)) ? asText(t.clienteId) : null;
      const lgpd = t.lgpd as Record<string, unknown> | undefined;
      const baseLegal = lgpd ? asText(lgpd.baseLegal) : null;

      if (t.aprovado === true || t.aprovado === false) {
        await this.pool.query(
          `UPDATE lanza.clientes SET analise_aprovado = $2, analise_avaliado_em = now(), atualizado_em = now()
           WHERE cpf_norm = $1 OR cpf = $1`,
          [cpf, t.aprovado],
        );
      }

      const fontes = t.fontes as Record<string, unknown>[] | undefined;
      if (Array.isArray(fontes)) {
        for (const f of fontes) {
          const origem = asText(f.id) ?? asText(f.nome) ?? "fonte";
          const status = mapAnaliseCadastroStatus(asBool(f.alerta, false), asText(f.status));
          await this.pool.query(
            `INSERT INTO lanza.cliente_analise_cadastro (
              id, cliente_id, cpf, data_consulta, consultado_em, origem, descricao, status,
              evidencia, base_legal, cadastrado_em, atualizado_em
            ) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8::lanza.analise_cadastro_status,$9,$10,
              COALESCE($11::timestamptz, now()), COALESCE($12::timestamptz, now()))
            ON CONFLICT (cpf, origem, data_consulta) DO UPDATE SET
              status = EXCLUDED.status, descricao = EXCLUDED.descricao, evidencia = EXCLUDED.evidencia,
              base_legal = COALESCE(EXCLUDED.base_legal, lanza.cliente_analise_cadastro.base_legal),
              atualizado_em = now()`,
            [
              randomUUID(),
              clienteId,
              cpf,
              dataConsulta,
              parseIso(asText(f.consultadoEm)),
              origem,
              asText(f.observacao) ?? "",
              status,
              asText(f.evidencia),
              baseLegal,
              parseIso(asText(t.cadastradoEm)),
              parseIso(asText(t.atualizadoEm)),
            ],
          );
        }
      } else if (dataConsulta) {
        await this.pool.query(
          `INSERT INTO lanza.cliente_analise_cadastro (
            id, cliente_id, cpf, data_consulta, origem, descricao, status, base_legal,
            cadastrado_em, atualizado_em
          ) VALUES ($1,$2,$3,$4::date,'triagem',$5,$6::lanza.analise_cadastro_status,$7,
            COALESCE($8::timestamptz, now()), COALESCE($9::timestamptz, now()))
          ON CONFLICT (cpf, origem, data_consulta) DO UPDATE SET
            status = EXCLUDED.status, descricao = EXCLUDED.descricao, atualizado_em = now()`,
          [
            triagemId,
            clienteId,
            cpf,
            dataConsulta,
            asText(t.resumo) ?? "",
            mapAnaliseCadastroStatus(asBool(t.alertaGeral, false), null),
            baseLegal,
            parseIso(asText(t.cadastradoEm)),
            parseIso(asText(t.atualizadoEm)),
          ],
        );
      }
    }
    return items.length;
  }

  private async importClienteAnalise(dir: string, dryRun: boolean): Promise<number> {
    const db = readJson<{ registros?: Record<string, unknown>[] }>(dir, "cliente-analise.json");
    const items = db?.registros ?? [];
    if (dryRun) return items.length;

    for (const r of items) {
      const id = asText(r.id) ?? randomUUID();
      const cpf = normCpf(asText(r.cpf)) ?? asText(r.cpf) ?? "";
      const origem = asText(r.fonte) ?? asText(r.site) ?? "?";
      const achados = r.achados as Record<string, unknown>[] | undefined;
      const achadosJson =
        Array.isArray(achados) && achados.length
          ? achados.map((a) => ({ tipo: asText(a.tipo) ?? "outro", descricao: asText(a.descricao) ?? "" }))
          : null;

      await this.pool.query(
        `INSERT INTO lanza.cliente_analise_cadastro (
          id, cliente_id, cpf, data_consulta, consultado_em, origem, descricao, status,
          evidencia, achados, cadastrado_em, atualizado_em
        ) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8::lanza.analise_cadastro_status,$9,$10,
          COALESCE($11::timestamptz, now()), COALESCE($12::timestamptz, now()))
        ON CONFLICT (cpf, origem, data_consulta) DO UPDATE SET
          descricao = EXCLUDED.descricao, status = EXCLUDED.status, evidencia = EXCLUDED.evidencia,
          achados = EXCLUDED.achados, consultado_em = EXCLUDED.consultado_em, atualizado_em = now()`,
        [
          id,
          isUuid(asText(r.clienteId)) ? r.clienteId : null,
          cpf,
          asText(r.dataConsulta) ?? "",
          parseIso(asText(r.consultadoEm)),
          origem,
          asText(r.identificado) ?? "",
          mapAnaliseCadastroStatus(asBool(r.alerta, false), asText(r.status)),
          asText(r.evidencia),
          achadosJson != null ? achadosJson : null,
          parseIso(asText(r.cadastradoEm)),
          parseIso(asText(r.atualizadoEm)),
        ],
      );
    }
    return items.length;
  }
}

export async function importJsonToRelational(
  options: RelationalImportOptions = {},
): Promise<RelationalImportResult> {
  const { getDefaultPostgresPool } = await import("../client/PostgresPool.js");
  const importer = new JsonToRelationalImporter(getDefaultPostgresPool());
  return importer.importAll(options);
}
