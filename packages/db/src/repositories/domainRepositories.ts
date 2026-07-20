import { randomUUID } from "node:crypto";

import { pgQuery } from "../client/PostgresPool.js";
import {
  asBool,
  asNumber,
  asText,
  compactPlaca,
  formatPlacaHyphen,
  isUuid,
  normCpf,
  parseIso,
} from "../migration/relationalUtils.js";

async function loadPlacaMap(): Promise<Map<string, string>> {
  const r = await pgQuery<{ id: string; placa_norm: string }>(
    "SELECT id, placa_norm FROM lanza.veiculos",
  );
  const map = new Map<string, string>();
  for (const row of r.rows) map.set(row.placa_norm, row.id);
  return map;
}

function resolveVeiculoId(
  ref: string | null | undefined,
  placaMap: Map<string, string>,
): string | null {
  if (!ref) return null;
  if (isUuid(ref)) return ref;
  return placaMap.get(compactPlaca(ref)) ?? null;
}

function rowIso(v: unknown): string | undefined {
  if (v == null) return undefined;
  return v instanceof Date ? v.toISOString() : String(v);
}

// --- Contratos ---

export type ContratosDbShape = {
  descricao?: string;
  atualizadoEm?: string;
  schemaContrato?: Record<string, string>;
  contratos: Record<string, unknown>[];
};

export async function loadContratosFromSql(): Promise<ContratosDbShape> {
  const base = await pgQuery("SELECT * FROM lanza.contratos ORDER BY cadastrado_em");
  const contratos: Record<string, unknown>[] = [];

  for (const row of base.rows) {
    const id = String(row.id);
    const cliSnap = await pgQuery("SELECT * FROM lanza.contrato_cliente_snapshots WHERE contrato_id = $1", [id]);
    const veiSnap = await pgQuery("SELECT * FROM lanza.contrato_veiculo_snapshots WHERE contrato_id = $1", [id]);
    const cs = cliSnap.rows[0];
    const vs = veiSnap.rows[0];

    contratos.push({
      id,
      versao: row.versao,
      contratoAnteriorId: row.contrato_anterior_id,
      clienteId: row.cliente_id,
      veiculoId: row.veiculo_placa ?? row.placa,
      pastaContrato: row.pasta_contrato,
      clienteNome: row.cliente_nome,
      placa: row.placa,
      cpf: row.cpf,
      dataInicio: row.data_inicio,
      dataFimPrevista: row.data_fim_prevista,
      dataEncerramento: row.data_encerramento,
      quebraContrato: row.quebra_contrato === true,
      motivoEncerramento: row.motivo_encerramento,
      status: row.status,
      prazoDias: row.prazo_dias,
      tipoContrato: row.tipo_contrato,
      diaPagamentoSemana: row.dia_pagamento_semana,
      diaPagamentoMes: row.dia_pagamento_mes,
      diaPagamentoTexto: row.dia_pagamento_texto,
      valorSemanal: row.valor_semanal != null ? Number(row.valor_semanal) : null,
      valorMensal: row.valor_mensal != null ? Number(row.valor_mensal) : null,
      valorDiaria: row.valor_diaria != null ? Number(row.valor_diaria) : null,
      valorCaucao: Number(row.valor_caucao ?? 0),
      dataInicioJurosMultaBr: row.data_inicio_juros_multa_br,
      cadastradoEm: rowIso(row.cadastrado_em),
      atualizadoEm: rowIso(row.atualizado_em),
      cliente: cs
        ? {
            id: cs.cliente_ref_id,
            nome: cs.nome,
            cpf: cs.cpf,
            rg: cs.rg,
            telefone: cs.telefone,
            email: cs.email,
            cnh: { categoria: cs.cnh_categoria, validade: cs.cnh_validade },
            endereco: {
              cep: cs.endereco_cep,
              logradouro: cs.endereco_logradouro,
              numero: cs.endereco_numero,
              complemento: cs.endereco_complemento,
              bairro: cs.endereco_bairro,
              cidade: cs.endereco_cidade,
              uf: cs.endereco_uf,
            },
          }
        : undefined,
      veiculo: vs
        ? {
            id: vs.veiculo_ref_id,
            placa: vs.placa,
            marcaModelo: vs.marca_modelo,
            fipeModelo: vs.fipe_modelo,
            anoModelo: vs.ano_modelo,
            chassi: vs.chassi,
            renavam: vs.renavam,
            cor: vs.cor,
            fipeValor: vs.fipe_valor,
          }
        : undefined,
    });
  }

  return {
    descricao: "Contratos de locação (ativos e encerrados). id = uuid.",
    atualizadoEm: new Date().toISOString().slice(0, 10),
    contratos,
  };
}

export async function saveContratosToSql(db: ContratosDbShape): Promise<void> {
  const placaMap = await loadPlacaMap();
  for (const c of db.contratos) {
    const id = asText(c.id) ?? randomUUID();
    const veiculoRef = asText(c.veiculoId) ?? asText(c.placa) ?? "";
    const placa = formatPlacaHyphen(asText(c.placa) ?? veiculoRef);
    await pgQuery(
      `INSERT INTO lanza.contratos (
        id, versao, contrato_anterior_id, cliente_id, veiculo_id, veiculo_placa,
        pasta_contrato, cliente_nome, placa, cpf, data_inicio, data_fim_prevista,
        data_encerramento, quebra_contrato, motivo_encerramento, status, prazo_dias,
        tipo_contrato, dia_pagamento_semana, dia_pagamento_mes, dia_pagamento_texto,
        valor_semanal, valor_mensal, valor_diaria, valor_caucao, data_inicio_juros_multa_br,
        cadastrado_em, atualizado_em
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
        COALESCE($27::timestamptz, now()), now())
      ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, data_encerramento = EXCLUDED.data_encerramento, atualizado_em = now()`,
      [
        id,
        asNumber(c.versao, 1),
        isUuid(asText(c.contratoAnteriorId)) ? c.contratoAnteriorId : null,
        isUuid(asText(c.clienteId)) ? c.clienteId : null,
        resolveVeiculoId(veiculoRef, placaMap),
        placa,
        asText(c.pastaContrato),
        asText(c.clienteNome) ?? "?",
        placa,
        asText(c.cpf),
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
        asText(c.dataInicioJurosMultaBr),
        parseIso(asText(c.cadastradoEm)),
      ],
    );
    const cli = c.cliente as Record<string, unknown> | undefined;
    if (cli) {
      const end = cli.endereco as Record<string, unknown> | undefined;
      const cnh = cli.cnh as Record<string, unknown> | undefined;
      await pgQuery(
        `INSERT INTO lanza.contrato_cliente_snapshots (
          contrato_id, cliente_ref_id, nome, cpf, rg, telefone, email,
          cnh_categoria, cnh_validade, endereco_cep, endereco_logradouro, endereco_numero,
          endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, atualizado_em
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now())
        ON CONFLICT (contrato_id) DO UPDATE SET nome = EXCLUDED.nome, atualizado_em = now()`,
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
      await pgQuery(
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
}

// --- Locações ---

export type LocacoesDbShape = {
  descricao?: string;
  atualizadoEm?: string;
  schemaLocacao?: Record<string, string>;
  locacoes: Record<string, unknown>[];
};

export async function loadLocacoesFromSql(): Promise<LocacoesDbShape> {
  const r = await pgQuery("SELECT * FROM lanza.locacoes ORDER BY inicio, cadastrado_em");
  return {
    descricao: "Linha do tempo de locação/reserva/manutenção.",
    atualizadoEm: new Date().toISOString().slice(0, 10),
    locacoes: r.rows.map((row) => ({
      id: String(row.id),
      veiculoId: row.veiculo_id ?? null,
      placa: row.placa,
      clienteId: row.cliente_id ?? null,
      condutorNome: row.condutor_nome ?? null,
      contratoId: row.contrato_id ?? null,
      situacao: row.situacao,
      inicio: row.inicio,
      fim: row.fim ?? null,
      tipoLocacao: row.tipo_locacao ?? null,
      valorCobrado: row.valor_cobrado != null ? Number(row.valor_cobrado) : null,
      valorPago: row.valor_pago != null ? Number(row.valor_pago) : null,
      substituiVeiculoId: row.substitui_veiculo_id ?? null,
      substituiPlaca: row.substitui_placa ?? null,
      observacao: row.observacao ?? null,
      cadastradoEm: rowIso(row.cadastrado_em),
      atualizadoEm: rowIso(row.atualizado_em),
    })),
  };
}

export async function saveLocacoesToSql(db: LocacoesDbShape): Promise<void> {
  const placaMap = await loadPlacaMap();
  for (const l of db.locacoes) {
    const id = asText(l.id) ?? randomUUID();
    await pgQuery(
      `INSERT INTO lanza.locacoes (
        id, veiculo_id, placa, cliente_id, condutor_nome, contrato_id, situacao, inicio, fim,
        tipo_locacao, valor_cobrado, valor_pago, substitui_veiculo_id, substitui_placa, observacao,
        cadastrado_em, atualizado_em
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16::timestamptz, now()), now())
      ON CONFLICT (id) DO UPDATE SET fim = EXCLUDED.fim, situacao = EXCLUDED.situacao, atualizado_em = now()`,
      [
        id,
        resolveVeiculoId(asText(l.veiculoId), placaMap),
        formatPlacaHyphen(asText(l.placa) ?? ""),
        isUuid(asText(l.clienteId)) ? l.clienteId : null,
        asText(l.condutorNome),
        isUuid(asText(l.contratoId)) ? l.contratoId : null,
        asText(l.situacao) ?? "locado",
        asText(l.inicio) ?? "",
        asText(l.fim),
        asText(l.tipoLocacao),
        l.valorCobrado != null ? asNumber(l.valorCobrado) : null,
        l.valorPago != null ? asNumber(l.valorPago) : null,
        resolveVeiculoId(asText(l.substituiVeiculoId), placaMap),
        asText(l.substituiPlaca),
        asText(l.observacao),
        parseIso(asText(l.cadastradoEm)),
      ],
    );
  }
}

// --- Infrações ---

export type InfracoesDbShape = {
  descricao?: string;
  atualizadoEm?: string;
  schemaInfracao?: Record<string, string>;
  infracoes: Record<string, unknown>[];
};

export async function loadInfracoesFromSql(): Promise<InfracoesDbShape> {
  const r = await pgQuery("SELECT * FROM lanza.infracoes ORDER BY data_autuacao");
  return {
    descricao: "Infrações DETRAN SC.",
    atualizadoEm: new Date().toISOString().slice(0, 10),
    infracoes: r.rows.map((row) => ({
      id: String(row.id),
      numeroAuto: row.numero_auto,
      idAutoInfracao: row.id_auto_infracao,
      veiculoId: row.veiculo_placa,
      descricao: row.descricao,
      dataAutuacao: row.data_autuacao,
      dataHoraAutuacao: row.data_hora_autuacao,
      localInfracao: row.local_infracao,
      valor: Number(row.valor),
      valorMulta: Number(row.valor_multa),
      situacao: row.situacao,
      status: row.status,
      protocolo: row.protocolo,
      dataLimiteDefesa: row.data_limite_defesa,
      limiteDefesa: row.limite_defesa,
      prazoDefesaExpirado: row.prazo_defesa_expirado === true,
      dataVencimentoOriginal: row.data_vencimento_original,
      convertidaEmDebito: row.convertida_em_debito === true,
      quitadaDetran: row.quitada_detran === true,
      statusInfracao: row.status_infracao,
      statusDetran: row.status_detran,
      fonte: row.fonte,
      condutorId: row.condutor_id,
      condutorConfirmado: row.condutor_confirmado === true,
      condutorContrato: row.condutor_contrato,
      condutorNaoIdentificado: row.condutor_nao_identificado === true,
      revisarManual: row.revisar_manual === true,
      revisarMotivo: row.revisar_motivo,
      pdfArquivo: row.pdf_arquivo,
      clienteDespesaId: row.cliente_despesa_id,
      parceiroDespesaId: row.parceiro_despesa_id,
      complemento: row.complemento,
      senhaDetran: row.senha_detran,
      notificacaoPdfArquivo: row.notificacao_pdf_arquivo,
      debitoParceiroConfirmado: row.debito_parceiro_confirmado === true,
      debitoParceiroId: row.debito_parceiro_id,
      detranRaw: row.detran_raw,
      origem: row.origem,
      syncEm: rowIso(row.sync_em),
      ativo: row.ativo !== false,
      cadastradoEm: rowIso(row.cadastrado_em),
      atualizadoEm: rowIso(row.atualizado_em),
    })),
  };
}

export async function saveInfracoesToSql(db: InfracoesDbShape): Promise<void> {
  const placaMap = await loadPlacaMap();
  for (const i of db.infracoes) {
    const id = asText(i.id) ?? randomUUID();
    const placa = formatPlacaHyphen(asText(i.veiculoId) ?? "");
    const raw = i.detranRaw as Record<string, unknown> | undefined;
    const complemento = asText(i.complemento) ?? asText(raw?.complemento);
    const senhaDetran = asText(i.senhaDetran) ?? asText(i.senha) ?? asText(raw?.senha);
    const debitoParceiroId = asText(i.debitoParceiroId);

    await pgQuery(
      `INSERT INTO lanza.infracoes (
        id, numero_auto, id_auto_infracao, veiculo_id, veiculo_placa, descricao, data_autuacao,
        data_hora_autuacao, local_infracao, valor, valor_multa, situacao, status, protocolo,
        data_limite_defesa, limite_defesa, prazo_defesa_expirado, data_vencimento_original,
        convertida_em_debito, quitada_detran, status_infracao, status_detran, fonte,
        condutor_id, condutor_confirmado, condutor_contrato, condutor_nao_identificado,
        revisar_manual, revisar_motivo, pdf_arquivo, cliente_despesa_id, parceiro_despesa_id,
        detran_raw, origem, sync_em, ativo, cadastrado_em, atualizado_em,
        complemento, senha_detran, notificacao_pdf_arquivo, debito_parceiro_confirmado, debito_parceiro_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
        $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,COALESCE($36::timestamptz, now()), now(),
        $37,$38,$39,$40,$41)
      ON CONFLICT (id) DO UPDATE SET situacao = EXCLUDED.situacao, valor = EXCLUDED.valor, atualizado_em = now()`,
      [
        id,
        asText(i.numeroAuto) ?? id,
        typeof i.idAutoInfracao === "number" ? i.idAutoInfracao : null,
        resolveVeiculoId(asText(i.veiculoId), placaMap),
        placa,
        asText(i.descricao) ?? "",
        asText(i.dataAutuacao) ?? "",
        asText(i.dataHoraAutuacao),
        asText(i.localInfracao),
        asNumber(i.valor ?? i.valorMulta, 0),
        asNumber(i.valorMulta ?? i.valor, 0),
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
        asBool(i.revisarManual, false),
        asText(i.revisarMotivo),
        asText(i.pdfArquivo),
        isUuid(asText(i.clienteDespesaId)) ? i.clienteDespesaId : null,
        isUuid(asText(i.parceiroDespesaId)) ? i.parceiroDespesaId : null,
        i.detranRaw != null ? (i.detranRaw as object) : null,
        asText(i.origem),
        parseIso(asText(i.syncEm)),
        asBool(i.ativo, true),
        parseIso(asText(i.cadastradoEm)),
        complemento,
        senhaDetran,
        asText(i.notificacaoPdfArquivo),
        asBool(i.debitoParceiroConfirmado, false),
        isUuid(debitoParceiroId) ? debitoParceiroId : null,
      ],
    );
  }
}

// --- Cliente despesas ---

export type ClienteDespesasDbShape = {
  descricao?: string;
  atualizadoEm?: string;
  schemaClienteDespesa?: Record<string, string>;
  clienteDespesas: Record<string, unknown>[];
};

export async function loadClienteDespesasFromSql(): Promise<ClienteDespesasDbShape> {
  const r = await pgQuery("SELECT * FROM lanza.cliente_despesas ORDER BY data_autuacao");
  return {
    descricao: "Débitos cobráveis do locatário.",
    atualizadoEm: new Date().toISOString().slice(0, 10),
    clienteDespesas: r.rows.map((row) => ({
      id: String(row.id),
      categoria: row.categoria,
      veiculoId: row.veiculo_placa,
      autoInfracao: row.auto_infracao,
      titulo: row.titulo,
      descricao: row.descricao,
      numeroAuto: row.numero_auto,
      localInfracao: row.local_infracao,
      dataAutuacao: row.data_autuacao,
      valorMulta: Number(row.valor_multa),
      situacao: row.situacao,
      limiteDefesa: row.limite_defesa,
      dataLimiteDefesa: row.data_limite_defesa,
      dataVencimentoOriginal: row.data_vencimento_original,
      convertidaEmDebito: row.convertida_em_debito === true,
      condutorId: row.condutor_id,
      condutorConfirmado: row.condutor_confirmado === true,
      condutorContrato: row.condutor_contrato,
      condutorNaoIdentificado: row.condutor_nao_identificado === true,
      debitoParceiroConfirmado: row.debito_parceiro_confirmado === true,
      debitoParceiroId: row.debito_parceiro_id,
      revisarManual: row.revisar_manual === true,
      revisarMotivo: row.revisar_motivo,
      paga: row.paga === true,
      pagaEm: rowIso(row.paga_em),
      quitadaDetran: row.quitada_detran === true,
      statusInfracao: row.status_infracao,
      statusDetran: row.status_detran,
      rastreameId: row.rastreame_id,
      rastreameMotoristaKey: row.rastreame_motorista_key,
      rastreameRastreavelKey: row.rastreame_rastreavel_key,
      rastreameDataIso: rowIso(row.rastreame_data_iso),
      rastreameTipo: row.rastreame_tipo,
      rastreameSyncEm: rowIso(row.rastreame_sync_em),
      detranAutoInfracao: row.detran_auto_infracao,
      pdfArquivo: row.pdf_arquivo,
      ativo: row.ativo !== false,
      origem: row.origem,
      cadastradoEm: rowIso(row.cadastrado_em),
      atualizadoEm: rowIso(row.atualizado_em),
    })),
  };
}

export async function saveClienteDespesasToSql(db: ClienteDespesasDbShape): Promise<void> {
  const placaMap = await loadPlacaMap();
  const infRows = await pgQuery<{ id: string; numero_auto: string }>(
    "SELECT id, numero_auto FROM lanza.infracoes",
  );
  const infracaoMap = new Map(infRows.rows.map((r) => [r.numero_auto.toLowerCase(), r.id]));

  for (const d of db.clienteDespesas) {
    const id = asText(d.id) ?? randomUUID();
    const placa = formatPlacaHyphen(asText(d.veiculoId) ?? "");
    const auto = asText(d.autoInfracao) ?? id;
    await pgQuery(
      `INSERT INTO lanza.cliente_despesas (
        id, categoria, veiculo_id, veiculo_placa, auto_infracao, titulo, descricao, numero_auto,
        local_infracao, data_autuacao, valor_multa, situacao, limite_defesa, data_limite_defesa,
        data_vencimento_original, convertida_em_debito, condutor_id, condutor_confirmado,
        condutor_contrato, condutor_nao_identificado, debito_parceiro_confirmado, debito_parceiro_id,
        revisar_manual, revisar_motivo, paga, paga_em, quitada_detran, status_infracao, status_detran,
        rastreame_id, rastreame_motorista_key, rastreame_rastreavel_key, rastreame_data_iso,
        rastreame_tipo, rastreame_sync_em, detran_auto_infracao, pdf_arquivo, infracao_id, ativo,
        origem, cadastrado_em, atualizado_em
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
        $30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,COALESCE($41::timestamptz, now()), now())
      ON CONFLICT (id) DO UPDATE SET paga = EXCLUDED.paga, situacao = EXCLUDED.situacao, atualizado_em = now()`,
      [
        id,
        asText(d.categoria),
        resolveVeiculoId(asText(d.veiculoId), placaMap),
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
        infracaoMap.get(auto.toLowerCase()) ?? null,
        asBool(d.ativo, true),
        asText(d.origem),
        parseIso(asText(d.cadastradoEm)),
      ],
    );
  }
}

// --- Parceiro despesas ---

export type ParceiroDespesasDbShape = {
  descricao?: string;
  atualizadoEm?: string;
  schemaParceiroDespesa?: Record<string, string>;
  parceiroDespesas: Record<string, unknown>[];
};

export async function loadParceiroDespesasFromSql(): Promise<ParceiroDespesasDbShape> {
  const r = await pgQuery("SELECT * FROM lanza.parceiro_despesas ORDER BY data");
  return {
    descricao: "Despesas do parceiro/proprietário.",
    atualizadoEm: new Date().toISOString().slice(0, 10),
    parceiroDespesas: r.rows.map((row) => ({
      id: String(row.id),
      veiculoId: row.veiculo_id,
      placa: row.placa,
      categoria: row.categoria,
      descricao: row.descricao,
      data: row.data,
      valor: Number(row.valor),
      competencia: row.competencia,
      origem: row.origem,
      rastreameManutencaoId: row.rastreame_manutencao_id,
      rastreameSyncEm: rowIso(row.rastreame_sync_em),
      rastreameHash: row.rastreame_hash,
      baixa: row.baixa,
    })),
  };
}

export async function saveParceiroDespesasToSql(db: ParceiroDespesasDbShape): Promise<void> {
  const placaMap = await loadPlacaMap();
  for (const d of db.parceiroDespesas) {
    const id = asText(d.id) ?? randomUUID();
    const placa = formatPlacaHyphen(asText(d.placa) ?? asText(d.veiculoId) ?? "");
    await pgQuery(
      `INSERT INTO lanza.parceiro_despesas (
        id, veiculo_id, placa, categoria, descricao, data, valor, competencia, origem,
        rastreame_manutencao_id, rastreame_sync_em, rastreame_hash, baixa, atualizado_em
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
      ON CONFLICT (id) DO UPDATE SET baixa = EXCLUDED.baixa, valor = EXCLUDED.valor, atualizado_em = now()`,
      [
        id,
        resolveVeiculoId(asText(d.veiculoId) ?? placa, placaMap),
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
}

// --- Triagens ---

export type TriagemDbShape = {
  descricao?: string;
  atualizadoEm?: string;
  schemaTriagem?: Record<string, string>;
  triagens: Record<string, unknown>[];
};

export async function loadTriagensFromSql(): Promise<TriagemDbShape> {
  const base = await pgQuery("SELECT * FROM lanza.triagens ORDER BY data_consulta DESC");
  const triagens: Record<string, unknown>[] = [];

  for (const row of base.rows) {
    const id = String(row.id);
    const lgpdR = await pgQuery("SELECT * FROM lanza.triagem_lgpd WHERE triagem_id = $1", [id]);
    const fontesR = await pgQuery("SELECT * FROM lanza.triagem_fontes WHERE triagem_id = $1", [id]);
    const lgpd = lgpdR.rows[0];

    triagens.push({
      id,
      clienteId: row.cliente_id,
      cpf: row.cpf,
      cpfFormatado: row.cpf_formatado,
      nome: row.nome,
      nascimento: row.nascimento,
      dataConsulta: row.data_consulta,
      alertaGeral: row.alerta_geral === true,
      aprovado: row.aprovado,
      resumo: row.resumo,
      relatorioJson: row.relatorio_json,
      relatorioTxt: row.relatorio_txt,
      cadastradoEm: rowIso(row.cadastrado_em),
      atualizadoEm: rowIso(row.atualizado_em),
      lgpd: lgpd
        ? {
            baseLegal: lgpd.base_legal,
            titularConsentimento: lgpd.titular_consentimento,
            solicitante: lgpd.solicitante,
            finalidade: lgpd.finalidade,
          }
        : undefined,
      fontes: fontesR.rows.map((f) => ({
        id: f.fonte_id,
        nome: f.fonte_nome,
        status: f.status,
        alerta: f.alerta === true,
        observacao: f.observacao,
        qtdAchados: f.qtd_achados,
        evidencia: f.evidencia,
        consultadoEm: rowIso(f.consultado_em),
      })),
    });
  }

  return {
    descricao: "Histórico de análises de cadastro.",
    atualizadoEm: new Date().toISOString().slice(0, 10),
    triagens,
  };
}

export async function saveTriagensToSql(db: TriagemDbShape): Promise<void> {
  for (const t of db.triagens) {
    const id = asText(t.id) ?? randomUUID();
    const cpf = normCpf(asText(t.cpf)) ?? asText(t.cpf) ?? "";
    await pgQuery(
      `INSERT INTO lanza.triagens (
        id, cliente_id, cpf, cpf_formatado, nome, nascimento, data_consulta,
        alerta_geral, aprovado, resumo, relatorio_json, relatorio_txt,
        cadastrado_em, atualizado_em
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::timestamptz, now()), now())
      ON CONFLICT (cpf, data_consulta) DO UPDATE SET aprovado = EXCLUDED.aprovado, resumo = EXCLUDED.resumo, atualizado_em = now()`,
      [
        id,
        isUuid(asText(t.clienteId)) ? t.clienteId : null,
        cpf,
        asText(t.cpfFormatado),
        asText(t.nome) ?? "?",
        asText(t.nascimento),
        asText(t.dataConsulta) ?? "",
        asBool(t.alertaGeral, false),
        t.aprovado === true || t.aprovado === false ? t.aprovado : null,
        asText(t.resumo),
        asText(t.relatorioJson),
        asText(t.relatorioTxt),
        parseIso(asText(t.cadastradoEm)),
      ],
    );

    const lgpd = t.lgpd as Record<string, unknown> | undefined;
    if (lgpd) {
      await pgQuery(
        `INSERT INTO lanza.triagem_lgpd (triagem_id, base_legal, titular_consentimento, solicitante, finalidade, atualizado_em)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (triagem_id) DO UPDATE SET base_legal = EXCLUDED.base_legal, atualizado_em = now()`,
        [
          id,
          asText(lgpd.baseLegal) ?? "consentimento",
          lgpd.titularConsentimento != null ? asBool(lgpd.titularConsentimento) : null,
          asText(lgpd.solicitante),
          asText(lgpd.finalidade),
        ],
      );
    }

    const fontes = t.fontes as Record<string, unknown>[] | undefined;
    if (Array.isArray(fontes)) {
      for (const f of fontes) {
        const rowId = randomUUID();
        const fonteKey = asText(f.id) ?? rowId;
        await pgQuery(
          `INSERT INTO lanza.triagem_fontes (
            id, triagem_id, fonte_id, fonte_nome, status, alerta, observacao, qtd_achados, evidencia, consultado_em, atualizado_em
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
          ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, alerta = EXCLUDED.alerta, atualizado_em = now()`,
          [
            rowId,
            id,
            fonteKey,
            asText(f.nome) ?? "?",
            asText(f.status) ?? "ok",
            asBool(f.alerta, false),
            asText(f.observacao),
            asNumber(f.qtdAchados, 0),
            asText(f.evidencia),
            parseIso(asText(f.consultadoEm)),
          ],
        );
      }
    }
  }
}

// --- Cliente análise ---

export type ClienteAnaliseDbShape = {
  descricao?: string;
  atualizadoEm?: string;
  schema?: Record<string, string>;
  registros: Record<string, unknown>[];
};

export async function loadClienteAnaliseFromSql(): Promise<ClienteAnaliseDbShape> {
  const base = await pgQuery("SELECT * FROM lanza.cliente_analise_registros ORDER BY data_consulta DESC");
  const registros: Record<string, unknown>[] = [];

  for (const row of base.rows) {
    const id = String(row.id);
    const achadosR = await pgQuery(
      "SELECT tipo, descricao FROM lanza.cliente_analise_achados WHERE registro_id = $1 ORDER BY ordem",
      [id],
    );
    registros.push({
      id,
      clienteId: row.cliente_id,
      cpf: row.cpf,
      cpfFormatado: row.cpf_formatado,
      nome: row.nome,
      fonte: row.fonte,
      fonteNome: row.fonte_nome,
      site: row.site,
      status: row.status,
      alerta: row.alerta === true,
      identificado: row.identificado,
      achados: achadosR.rows.map((a) => ({ tipo: a.tipo, descricao: a.descricao })),
      evidencia: row.evidencia,
      dataConsulta: row.data_consulta,
      consultadoEm: rowIso(row.consultado_em),
      analiseId: row.analise_id,
      cadastradoEm: rowIso(row.cadastrado_em),
      atualizadoEm: rowIso(row.atualizado_em),
    });
  }

  return {
    descricao: "Achados da análise de cadastro por cliente.",
    atualizadoEm: new Date().toISOString().slice(0, 10),
    registros,
  };
}

export async function saveClienteAnaliseToSql(db: ClienteAnaliseDbShape): Promise<void> {
  for (const r of db.registros) {
    const id = asText(r.id) ?? randomUUID();
    const cpf = normCpf(asText(r.cpf)) ?? asText(r.cpf) ?? "";
    await pgQuery(
      `INSERT INTO lanza.cliente_analise_registros (
        id, cliente_id, cpf, cpf_formatado, nome, fonte, fonte_nome, site, status, alerta,
        identificado, evidencia, data_consulta, consultado_em, analise_id,
        cadastrado_em, atualizado_em
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16::timestamptz, now()), now())
      ON CONFLICT (cpf, fonte, data_consulta) DO UPDATE SET identificado = EXCLUDED.identificado, alerta = EXCLUDED.alerta, atualizado_em = now()`,
      [
        id,
        isUuid(asText(r.clienteId)) ? r.clienteId : null,
        cpf,
        asText(r.cpfFormatado),
        asText(r.nome) ?? "?",
        asText(r.fonte) ?? "?",
        asText(r.fonteNome) ?? asText(r.fonte) ?? "?",
        asText(r.site),
        asText(r.status) ?? "ok",
        asBool(r.alerta, false),
        asText(r.identificado),
        asText(r.evidencia),
        asText(r.dataConsulta) ?? "",
        parseIso(asText(r.consultadoEm)),
        isUuid(asText(r.analiseId)) ? r.analiseId : null,
        parseIso(asText(r.cadastradoEm)),
      ],
    );

    const achados = r.achados as Record<string, unknown>[] | undefined;
    if (Array.isArray(achados)) {
      await pgQuery("DELETE FROM lanza.cliente_analise_achados WHERE registro_id = $1", [id]);
      let ordem = 0;
      for (const a of achados) {
        await pgQuery(
          `INSERT INTO lanza.cliente_analise_achados (id, registro_id, tipo, descricao, ordem, atualizado_em)
           VALUES ($1,$2,$3,$4,$5,now())`,
          [randomUUID(), id, asText(a.tipo) ?? "outro", asText(a.descricao) ?? "", ordem++],
        );
      }
    }
  }
}
