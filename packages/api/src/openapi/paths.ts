import {
  jsonBody,
  mergePaths,
  op,
  pathItem,
  pathParam,
  query,
  refParam,
} from "./helpers.js";
import type { OpenApiPaths } from "./types.js";

const crudId = pathParam("id");
const numeroAuto = pathParam("numeroAuto", "Número do auto de infração");

function pathsSistema(): OpenApiPaths {
  return {
    "/health": pathItem({
      get: op("get", "Sistema", "Health check", {
        operationId: "health",
        security: [],
        responses: {
          "200": {
            description: "API disponível",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
          },
        },
      }),
    }),
    "/api/meta": pathItem({
      get: op("get", "Sistema", "Metadados da API e paths operacionais", {
        operationId: "meta",
      }),
    }),
    "/api/resumo": pathItem({
      get: op("get", "Sistema", "Dashboard — contagens e pendências", {
        operationId: "resumo",
      }),
    }),
  };
}

function pathsClientes(): OpenApiPaths {
  const listParams = [refParam("AtivoQuery")];
  const body = jsonBody(
    {
      nome: { type: "string" },
      cpf: { type: "string" },
      cnh: { type: "string" },
      ativo: { type: "boolean" },
    },
    ["nome"],
  );
  return {
    "/api/clientes": pathItem({
      get: op("get", "Clientes", "Listar clientes", {
        operationId: "listarClientes",
        parameters: listParams,
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
      post: op("post", "Clientes", "Criar cliente", {
        operationId: "criarCliente",
        requestBody: body,
        responses: { "201": { $ref: "#/components/responses/Created" } },
      }),
    }),
    "/api/clientes/{id}": pathItem({
      get: op("get", "Clientes", "Obter cliente por id ou CPF", {
        operationId: "obterCliente",
        parameters: [crudId],
        responses: {
          "200": { $ref: "#/components/responses/OkJson" },
          "404": { $ref: "#/components/responses/NotFound" },
        },
      }),
      patch: op("patch", "Clientes", "Atualizar cliente", {
        operationId: "atualizarCliente",
        parameters: [crudId],
        requestBody: { type: "object" },
        requestBodyRequired: false,
      }),
      delete: op("delete", "Clientes", "Excluir cliente", {
        operationId: "excluirCliente",
        parameters: [crudId],
      }),
    }),
  };
}

function pathsVeiculos(): OpenApiPaths {
  return {
    "/api/veiculos": pathItem({
      get: op("get", "Veículos", "Listar veículos", {
        operationId: "listarVeiculos",
        parameters: [refParam("PlacaQuery"), refParam("AtivoQuery")],
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
      post: op("post", "Veículos", "Cadastrar veículo (CRLV)", {
        operationId: "criarVeiculo",
        requestBody: jsonBody({ placa: { type: "string" }, marcaModelo: { type: "string" } }, [
          "placa",
        ]),
        responses: { "201": { $ref: "#/components/responses/Created" } },
      }),
    }),
    "/api/veiculos/{id}": pathItem({
      get: op("get", "Veículos", "Obter veículo", {
        operationId: "obterVeiculo",
        parameters: [crudId],
      }),
      patch: op("patch", "Veículos", "Atualizar veículo", {
        operationId: "atualizarVeiculo",
        parameters: [crudId],
        requestBody: { type: "object" },
        requestBodyRequired: false,
      }),
      delete: op("delete", "Veículos", "Excluir veículo", {
        operationId: "excluirVeiculo",
        parameters: [crudId],
      }),
    }),
    "/api/veiculos/inicio-locacoes": pathItem({
      get: op("get", "Veículos", "Listar início de locações derivado por placa", {
        operationId: "listarInicioLocacoes",
      }),
    }),
    "/api/veiculos/inicio-locacoes/derivar": pathItem({
      post: op("post", "Veículos", "Derivar e gravar inicioLocacoes em veiculos.json", {
        operationId: "derivarInicioLocacoes",
        requestBody: jsonBody({
          sobrescrever: { type: "boolean" },
          dryRun: { type: "boolean" },
        }),
        requestBodyRequired: false,
      }),
    }),
  };
}

function pathsContratos(): OpenApiPaths {
  return {
    "/api/contratos": pathItem({
      get: op("get", "Contratos", "Listar contratos", {
        operationId: "listarContratos",
        parameters: [
          query("status", { type: "string", enum: ["ativo", "encerrado"] }),
          query("clienteId", { type: "string" }),
          query("veiculoId", { type: "string" }),
          refParam("PlacaQuery"),
        ],
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
    }),
    "/api/contratos/criar": pathItem({
      post: op("post", "Contratos", "Gerar contrato (Word/PDF) e registrar", {
        operationId: "criarContrato",
        description: "Aceita dados completos ou `{ placa, semana, ... }` para montar do DB.",
        requestBody: { type: "object" },
      }),
    }),
    "/api/contratos/renovar": pathItem({
      post: op("post", "Contratos", "Renovar contrato", {
        operationId: "renovarContrato",
        requestBody: { type: "object" },
      }),
    }),
    "/api/contratos/encerrar": pathItem({
      post: op("post", "Contratos", "Encerrar contrato", {
        operationId: "encerrarContrato",
        requestBody: jsonBody(
          {
            idOuPasta: { type: "string" },
            id: { type: "string" },
            dataEncerramento: { type: "string", description: "DD/MM/AAAA" },
            motivoEncerramento: {
              type: "string",
              enum: ["devolucao", "recuperacao", "troca", "outro"],
            },
            quebraContrato: { type: "boolean" },
          },
          ["dataEncerramento", "motivoEncerramento"],
        ),
      }),
    }),
    "/api/contratos/sincronizar": pathItem({
      post: op("post", "Contratos", "Importar contratos das pastas Dropbox", {
        operationId: "sincronizarContratos",
        requestBody: jsonBody({
          raiz: { type: "string", description: "Pasta raiz (default: contratosDir)" },
          dryRun: { type: "boolean" },
        }),
        requestBodyRequired: false,
      }),
    }),
    "/api/contratos/{id}": pathItem({
      get: op("get", "Contratos", "Obter contrato", {
        operationId: "obterContrato",
        parameters: [crudId],
      }),
      delete: op("delete", "Contratos", "Excluir contrato do database", {
        operationId: "excluirContrato",
        parameters: [crudId],
      }),
    }),
  };
}

function pathsDespesas(): OpenApiPaths {
  return {
    "/api/despesas": pathItem({
      get: op("get", "Despesas cliente", "Listar despesas do locatário", {
        operationId: "listarDespesas",
        parameters: [
          refParam("PlacaQuery"),
          query("clienteId", { type: "string" }),
          query("categoria", { type: "string" }),
          refParam("EmAbertoQuery"),
          refParam("AtivoQuery"),
        ],
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
      post: op("post", "Despesas cliente", "Criar despesa cliente", {
        operationId: "criarDespesa",
        requestBody: { type: "object" },
        responses: { "201": { $ref: "#/components/responses/Created" } },
      }),
    }),
    "/api/despesas/{id}": pathItem({
      get: op("get", "Despesas cliente", "Obter despesa", {
        operationId: "obterDespesa",
        parameters: [crudId],
      }),
      patch: op("patch", "Despesas cliente", "Atualizar despesa", {
        operationId: "atualizarDespesa",
        parameters: [crudId],
        requestBody: { type: "object" },
        requestBodyRequired: false,
      }),
      delete: op("delete", "Despesas cliente", "Excluir despesa", {
        operationId: "excluirDespesa",
        parameters: [crudId],
      }),
    }),
    "/api/despesas/{id}/confirmar-condutor": pathItem({
      post: op("post", "Despesas cliente", "Confirmar condutor da despesa", {
        operationId: "confirmarCondutorDespesa",
        parameters: [crudId],
        requestBody: jsonBody({
          condutorId: { type: "string" },
          naoIdentificado: { type: "boolean" },
        }),
        requestBodyRequired: false,
      }),
    }),
  };
}

function pathsParceiroDespesas(): OpenApiPaths {
  return {
    "/api/parceiro-despesas": pathItem({
      get: op("get", "Despesas parceiro", "Listar despesas do parceiro", {
        operationId: "listarParceiroDespesas",
        parameters: [
          refParam("PlacaQuery"),
          query("categoria", { type: "string" }),
          query("competencia", { type: "string", description: "MM/AAAA" }),
          refParam("EmAbertoQuery"),
        ],
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
      post: op("post", "Despesas parceiro", "Criar despesa parceiro", {
        operationId: "criarParceiroDespesa",
        requestBody: { type: "object" },
        responses: { "201": { $ref: "#/components/responses/Created" } },
      }),
    }),
    "/api/parceiro-despesas/baixa": pathItem({
      post: op("post", "Despesas parceiro", "Marcar baixa de despesa(s)", {
        operationId: "baixarParceiroDespesa",
        requestBody: jsonBody({
          id: { type: "string" },
          placa: { type: "string" },
          categoria: { type: "string" },
          competencia: { type: "string" },
          data: { type: "string" },
          desfazer: { type: "boolean" },
        }),
        requestBodyRequired: false,
      }),
    }),
    "/api/parceiro-despesas/rastreador": pathItem({
      post: op("post", "Despesas parceiro", "Lançar rastreador fixo mensal (R$ 50)", {
        operationId: "lancarRastreador",
        requestBody: jsonBody({
          desde: { type: "string", example: "01/2026" },
          ate: { type: "string", example: "07/2026" },
          dryRun: { type: "boolean" },
        }),
        requestBodyRequired: false,
      }),
    }),
    "/api/parceiro-despesas/{id}": pathItem({
      get: op("get", "Despesas parceiro", "Obter despesa parceiro", {
        operationId: "obterParceiroDespesa",
        parameters: [crudId],
      }),
      patch: op("patch", "Despesas parceiro", "Atualizar despesa parceiro", {
        operationId: "atualizarParceiroDespesa",
        parameters: [crudId],
        requestBody: { type: "object" },
        requestBodyRequired: false,
      }),
      delete: op("delete", "Despesas parceiro", "Excluir despesa parceiro", {
        operationId: "excluirParceiroDespesa",
        parameters: [crudId],
      }),
    }),
  };
}

function pathsLocacoes(): OpenApiPaths {
  return {
    "/api/locacoes": pathItem({
      get: op("get", "Locações", "Listar locações / movimentações", {
        operationId: "listarLocacoes",
        parameters: [
          refParam("PlacaQuery"),
          query("clienteId", { type: "string" }),
          query("situacao", { type: "string", enum: ["locado", "reserva", "manutencao"] }),
          query("abertas", { type: "boolean" }),
        ],
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
      post: op("post", "Locações", "Criar ou atualizar locação", {
        operationId: "gravarLocacao",
        requestBody: jsonBody({
          id: { type: "string" },
          placa: { type: "string" },
          situacao: { type: "string", enum: ["locado", "reserva", "manutencao"] },
          inicio: { type: "string" },
          fim: { type: "string", nullable: true },
          tipoLocacao: { type: "string", enum: ["diaria", "semanal", "mensal"] },
          valorCobrado: { type: "number" },
          valorPago: { type: "number" },
        }),
      }),
    }),
    "/api/locacoes/sugerir": pathItem({
      post: op("post", "Locações", "Sugerir ganhos/descontos para prestação de contas", {
        operationId: "sugerirLocacoes",
        requestBody: jsonBody(
          {
            competencia: { type: "string", example: "06/2026" },
            inicio: { type: "string" },
            fim: { type: "string" },
            placa: { type: "string" },
          },
          ["competencia"],
        ),
      }),
    }),
    "/api/locacoes/{id}": pathItem({
      get: op("get", "Locações", "Obter locação", {
        operationId: "obterLocacao",
        parameters: [crudId],
      }),
      patch: op("patch", "Locações", "Atualizar locação", {
        operationId: "atualizarLocacao",
        parameters: [crudId],
        requestBody: { type: "object" },
        requestBodyRequired: false,
      }),
      delete: op("delete", "Locações", "Excluir locação", {
        operationId: "excluirLocacao",
        parameters: [crudId],
      }),
    }),
  };
}

function pathsInfracoes(): OpenApiPaths {
  return {
    "/api/infracoes": pathItem({
      get: op("get", "Infrações", "Listar infrações DETRAN", {
        operationId: "listarInfracoes",
        parameters: [
          refParam("PlacaQuery"),
          query("veiculoId", { type: "string" }),
          refParam("EmAbertoQuery"),
          refParam("AtivoQuery"),
          query("semCondutor", { type: "boolean" }),
        ],
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
    }),
    "/api/infracoes/atribuir-condutores": pathItem({
      post: op("post", "Infrações", "Reconciliar condutores (infrações e pedágios)", {
        operationId: "atribuirCondutores",
        requestBody: jsonBody({
          dryRun: { type: "boolean" },
          placa: { type: "string" },
          prazoDias: { type: "integer", default: 90 },
          incluirPedagios: { type: "boolean" },
        }),
        requestBodyRequired: false,
      }),
    }),
    "/api/infracoes/{numeroAuto}": pathItem({
      get: op("get", "Infrações", "Obter infração", {
        operationId: "obterInfracao",
        parameters: [numeroAuto],
      }),
    }),
    "/api/infracoes/{numeroAuto}/confirmar-parceiro": pathItem({
      post: op("post", "Infrações", "Confirmar débito do parceiro", {
        operationId: "confirmarParceiroInfracao",
        parameters: [numeroAuto],
        requestBody: jsonBody({ parceiroId: { type: "string", nullable: true } }),
        requestBodyRequired: false,
      }),
    }),
    "/api/infracoes/{numeroAuto}/vincular-despesa": pathItem({
      post: op("post", "Infrações", "Vincular cliente-despesa à infração", {
        operationId: "vincularDespesaInfracao",
        parameters: [numeroAuto],
        requestBody: jsonBody({ clienteDespesaId: { type: "string" } }, ["clienteDespesaId"]),
      }),
    }),
  };
}

function pathsRecebimentos(): OpenApiPaths {
  return {
    "/api/recebimentos/plano": pathItem({
      post: op("post", "Recebimentos", "Montar plano de baixa (unitário ou lote)", {
        operationId: "planoRecebimento",
        requestBody: { type: "object" },
      }),
    }),
    "/api/recebimentos/executar": pathItem({
      post: op("post", "Recebimentos", "Executar baixa no Rastreame + cliente-despesas", {
        operationId: "executarRecebimento",
        description: "Requer confirmação linha a linha no fluxo CLI; na API executa o lote enviado.",
        requestBody: { type: "object" },
      }),
    }),
  };
}

function pathsRelatorios(): OpenApiPaths {
  return {
    "/api/relatorios/cobrancas/meta": pathItem({
      get: op("get", "Relatórios", "Metadados de tipos de cobrança", {
        operationId: "cobrancasMeta",
      }),
    }),
    "/api/relatorios/cobrancas/escopos": pathItem({
      get: op("get", "Relatórios", "Escopos de contratos ativos para cobrança", {
        operationId: "cobrancasEscopos",
      }),
    }),
    "/api/relatorios/cobrancas/alvos": pathItem({
      get: op("get", "Relatórios", "Listar alvos de cobrança", {
        operationId: "cobrancasAlvos",
        parameters: [
          query("tipo", { type: "string" }),
          query("escopo", { type: "string" }),
          query("placa", { type: "string" }),
          query("clienteId", { type: "string" }),
        ],
      }),
    }),
    "/api/relatorios/cobrancas": pathItem({
      post: op("post", "Relatórios", "Gerar lote de cobranças WhatsApp", {
        operationId: "gerarCobrancas",
        requestBody: { type: "object" },
      }),
    }),
    "/api/relatorios/cobrancas/placa": pathItem({
      post: op("post", "Relatórios", "Cobrança por placa (multa/pedágio/manutenção)", {
        operationId: "cobrancaPlaca",
        requestBody: { type: "object" },
      }),
    }),
    "/api/relatorios/cobrancas/semanal-atraso": pathItem({
      post: op("post", "Relatórios", "Cobrança pagamento semanal em atraso", {
        operationId: "cobrancaSemanalAtraso",
        requestBody: { type: "object" },
      }),
    }),
    "/api/relatorios/infracoes": pathItem({
      get: op("get", "Relatórios", "Relatório de infrações (sidecar/canvas)", {
        operationId: "relatorioInfracoes",
        parameters: [query("placa", { type: "string" }), query("global", { type: "boolean" })],
      }),
    }),
    "/api/relatorios/encerramento": pathItem({
      post: op("post", "Relatórios", "Relatório de encerramento de contrato", {
        operationId: "relatorioEncerramento",
        requestBody: { type: "object" },
      }),
    }),
    "/api/relatorios/prestacao-contas": pathItem({
      post: op("post", "Relatórios", "Prestação de contas mensal parceiro", {
        operationId: "prestacaoContas",
        requestBody: jsonBody({
          competencia: { type: "string", example: "06/2026" },
          placa: { type: "string" },
          parceiroId: { type: "string" },
        }),
      }),
    }),
  };
}

function pathsSync(): OpenApiPaths {
  const syncBody = jsonBody({
    dryRun: { type: "boolean" },
    placa: { type: "string" },
    pullOnly: { type: "boolean" },
    pushOnly: { type: "boolean" },
    jsonPath: { type: "string", description: "Modo offline (pedágios/DETRAN)" },
  });
  return {
    "/api/sync": pathItem({
      get: op("get", "Sync", "Catálogo de syncs disponíveis", {
        operationId: "syncMeta",
      }),
    }),
    "/api/sync/completo": pathItem({
      post: op("post", "Sync", "Disparar todos os syncs (job assíncrono)", {
        operationId: "syncCompleto",
        requestBody: syncBody,
        requestBodyRequired: false,
        responses: {
          "202": {
            description: "Job aceito",
            content: { "application/json": { schema: { $ref: "#/components/schemas/JobEnvelope" } } },
          },
        },
      }),
    }),
    "/api/sync/jobs": pathItem({
      get: op("get", "Sync", "Listar jobs de sync", {
        operationId: "listarSyncJobs",
      }),
    }),
    "/api/sync/jobs/{id}": pathItem({
      get: op("get", "Sync", "Status de um job de sync", {
        operationId: "obterSyncJob",
        parameters: [crudId],
      }),
    }),
    "/api/sync/{nome}": pathItem({
      post: op("post", "Sync", "Executar um sync por nome", {
        operationId: "executarSync",
        description:
          "Nomes: pedagios, infracoes, ipva-licenciamento, detran-rs, motoristas, rastreaveis, fipe, recebimentos, seguro, manutencao.",
        parameters: [pathParam("nome")],
        requestBody: syncBody,
        requestBodyRequired: false,
      }),
    }),
  };
}

function pathsImportacoes(): OpenApiPaths {
  return {
    "/api/importacoes/cnh/preview": pathItem({
      get: op("get", "Importações", "Preview importação CNH", {
        operationId: "previewImportacaoCnh",
        parameters: [query("raiz", { type: "string" })],
      }),
    }),
    "/api/importacoes/cnh": pathItem({
      post: op("post", "Importações", "Importar clientes a partir de CNH (PDF)", {
        operationId: "importarCnh",
        requestBody: jsonBody({
          raiz: { type: "string" },
          dryRun: { type: "boolean" },
          pastas: { type: "array", items: { type: "string" } },
        }),
        requestBodyRequired: false,
      }),
    }),
    "/api/importacoes/crlv": pathItem({
      post: op("post", "Importações", "Sincronizar veículos a partir de CRLV (PDF)", {
        operationId: "importarCrlv",
        requestBody: jsonBody({
          placa: { type: "string" },
          dryRun: { type: "boolean" },
        }),
        requestBodyRequired: false,
      }),
    }),
    "/api/importacoes/contratos": pathItem({
      post: op("post", "Importações", "Importar contratos das pastas Dropbox", {
        operationId: "importarContratos",
        requestBody: jsonBody({
          raiz: { type: "string" },
          dryRun: { type: "boolean" },
        }),
        requestBodyRequired: false,
      }),
    }),
    "/api/importacoes/rastreame-clientes": pathItem({
      post: op("post", "Importações", "Importar motoristas do Rastreame → clientes.json", {
        operationId: "importarClientesRastreame",
        requestBody: jsonBody({ dryRun: { type: "boolean" } }),
        requestBodyRequired: false,
      }),
    }),
  };
}

function pathsAnaliseCadastro(): OpenApiPaths {
  return {
    "/api/analise-cadastro": pathItem({
      get: op("get", "Análise cadastro", "Listar triagens", {
        operationId: "listarTriagens",
        parameters: [
          query("cpf", { type: "string" }),
          query("comAlerta", { type: "boolean" }),
        ],
      }),
      post: op("post", "Análise cadastro", "Iniciar triagem (job assíncrono)", {
        operationId: "iniciarTriagem",
        requestBody: jsonBody(
          {
            cpf: { type: "string" },
            nome: { type: "string" },
            dataNascimento: { type: "string" },
            baseLegal: { type: "string" },
            clienteId: { type: "string" },
            fontes: { type: "array", items: { type: "string" } },
          },
          ["cpf", "nome", "dataNascimento", "baseLegal"],
        ),
        responses: {
          "202": {
            description: "Job aceito",
            content: { "application/json": { schema: { $ref: "#/components/schemas/JobEnvelope" } } },
          },
        },
      }),
    }),
    "/api/analise-cadastro/jobs/{id}": pathItem({
      get: op("get", "Análise cadastro", "Status do job de triagem", {
        operationId: "obterTriagemJob",
        parameters: [crudId],
      }),
    }),
    "/api/analise-cadastro/{id}": pathItem({
      get: op("get", "Análise cadastro", "Obter triagem por id", {
        operationId: "obterTriagem",
        parameters: [crudId],
      }),
    }),
    "/api/analise-cadastro/{id}/decisao": pathItem({
      patch: op("patch", "Análise cadastro", "Aprovar ou reprovar triagem", {
        operationId: "decisaoTriagem",
        parameters: [crudId],
        requestBody: jsonBody(
          { aprovado: { type: "boolean" } },
          ["aprovado"],
        ),
      }),
    }),
    "/api/cliente-analise": pathItem({
      get: op("get", "Análise cadastro", "Achados por cliente (BNMP/PF/TJSC)", {
        operationId: "listarClienteAnalise",
        parameters: [
          query("cpf", { type: "string" }),
          query("clienteId", { type: "string" }),
          query("comAlerta", { type: "boolean" }),
        ],
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
    }),
  };
}

function pathsFipe(): OpenApiPaths {
  return {
    "/api/fipe/marcas": pathItem({
      get: op("get", "FIPE", "Listar marcas", {
        operationId: "fipeMarcas",
        parameters: [query("tipo", { type: "string", enum: ["carros", "motos", "caminhoes"] })],
      }),
    }),
    "/api/fipe/marcas/{marcaCode}/modelos": pathItem({
      get: op("get", "FIPE", "Listar modelos da marca", {
        operationId: "fipeModelos",
        parameters: [pathParam("marcaCode"), query("tipo", { type: "string" })],
      }),
    }),
    "/api/fipe/marcas/{marcaCode}/modelos/{modeloCode}/anos": pathItem({
      get: op("get", "FIPE", "Listar anos do modelo", {
        operationId: "fipeAnos",
        parameters: [
          pathParam("marcaCode"),
          pathParam("modeloCode"),
          query("tipo", { type: "string" }),
        ],
      }),
    }),
    "/api/fipe/marcas/{marcaCode}/modelos/{modeloCode}/anos/{anoCode}": pathItem({
      get: op("get", "FIPE", "Consultar valor FIPE", {
        operationId: "fipeValor",
        parameters: [
          pathParam("marcaCode"),
          pathParam("modeloCode"),
          pathParam("anoCode"),
          query("tipo", { type: "string" }),
        ],
      }),
    }),
    "/api/fipe/atualizar-veiculo": pathItem({
      post: op("post", "FIPE", "Atualizar veículo com valor FIPE", {
        operationId: "fipeAtualizarVeiculo",
        requestBody: jsonBody({
          placa: { type: "string" },
          marcaCode: { type: "string" },
          modeloCode: { type: "string" },
          anoCode: { type: "string" },
        }),
      }),
    }),
  };
}

function pathsParceiros(): OpenApiPaths {
  return {
    "/api/parceiros": pathItem({
      get: op("get", "Parceiros", "Listar parceiros", {
        operationId: "listarParceiros",
        responses: { "200": { $ref: "#/components/responses/OkList" } },
      }),
      post: op("post", "Parceiros", "Criar parceiro", {
        operationId: "criarParceiro",
        requestBody: { type: "object" },
        responses: { "201": { $ref: "#/components/responses/Created" } },
      }),
    }),
    "/api/parceiros/{id}": pathItem({
      get: op("get", "Parceiros", "Obter parceiro", {
        operationId: "obterParceiro",
        parameters: [crudId],
      }),
      patch: op("patch", "Parceiros", "Atualizar parceiro", {
        operationId: "atualizarParceiro",
        parameters: [crudId],
        requestBody: { type: "object" },
        requestBodyRequired: false,
      }),
      delete: op("delete", "Parceiros", "Excluir parceiro", {
        operationId: "excluirParceiro",
        parameters: [crudId],
      }),
    }),
    "/api/parceiros/vinculos": pathItem({
      get: op("get", "Parceiros", "Listar vínculos parceiro↔veículo", {
        operationId: "listarVinculos",
        parameters: [query("parceiroId", { type: "string" }), query("veiculoId", { type: "string" })],
      }),
      post: op("post", "Parceiros", "Criar vínculo", {
        operationId: "criarVinculo",
        requestBody: jsonBody({
          parceiroId: { type: "string" },
          veiculoId: { type: "string" },
        }),
      }),
    }),
    "/api/parceiros/vinculos/{id}": pathItem({
      delete: op("delete", "Parceiros", "Excluir vínculo", {
        operationId: "excluirVinculo",
        parameters: [crudId],
      }),
    }),
  };
}

function pathsRenegociacao(): OpenApiPaths {
  return {
    "/api/renegociacao/resumo": pathItem({
      get: op("get", "Renegociação", "Resumo de débitos em aberto", {
        operationId: "renegociacaoResumo",
        parameters: [query("clienteId", { type: "string" }), query("cpf", { type: "string" })],
      }),
    }),
    "/api/renegociacao/preview": pathItem({
      post: op("post", "Renegociação", "Preview da renegociação", {
        operationId: "renegociacaoPreview",
        requestBody: { type: "object" },
      }),
    }),
    "/api/renegociacao/executar": pathItem({
      post: op("post", "Renegociação", "Executar renegociação no Rastreame", {
        operationId: "renegociacaoExecutar",
        requestBody: { type: "object" },
      }),
    }),
  };
}

function pathsRastreame(): OpenApiPaths {
  return {
    "/api/rastreame/auth": pathItem({
      get: op("get", "Rastreame", "Status da autenticação", {
        operationId: "rastreameAuth",
      }),
    }),
    "/api/rastreame/login": pathItem({
      post: op("post", "Rastreame", "Login e captura de token", {
        operationId: "rastreameLogin",
        requestBody: jsonBody({ save: { type: "boolean", description: "Gravar em env do utilizador" } }),
        requestBodyRequired: false,
      }),
    }),
    "/api/rastreame/motoristas/check": pathItem({
      get: op("get", "Rastreame", "Verificar motorista por CNH", {
        operationId: "rastreameMotoristaCheck",
        parameters: [
          query("cnh", { type: "string" }, "CNH obrigatória"),
          query("nome", { type: "string" }),
        ],
      }),
    }),
    "/api/rastreame/motoristas": pathItem({
      get: op("get", "Rastreame", "Listar motoristas remotos", {
        operationId: "rastreameListarMotoristas",
      }),
      post: op("post", "Rastreame", "Criar/atualizar motorista", {
        operationId: "rastreameUpsertMotorista",
        requestBody: { type: "object" },
      }),
    }),
    "/api/rastreame/gastos": pathItem({
      get: op("get", "Rastreame", "Listar gastos gerais", {
        operationId: "rastreameListarGastos",
        parameters: [
          refParam("PaginaQuery"),
          query("size", { type: "integer" }),
          query("dataInicial", { type: "string" }),
          query("dataFinal", { type: "string" }),
        ],
      }),
      post: op("post", "Rastreame", "Criar gasto", {
        operationId: "rastreameCriarGasto",
        requestBody: { type: "object" },
        responses: { "201": { $ref: "#/components/responses/Created" } },
      }),
    }),
    "/api/rastreame/gastos/{id}": pathItem({
      get: op("get", "Rastreame", "Obter gasto", {
        operationId: "rastreameObterGasto",
        parameters: [crudId],
      }),
      put: op("put", "Rastreame", "Atualizar gasto", {
        operationId: "rastreameAtualizarGasto",
        parameters: [crudId],
        requestBody: { type: "object" },
      }),
    }),
    "/api/rastreame/lancar-semanal": pathItem({
      post: op("post", "Rastreame", "Lançar pagamentos semanais (contratos ativos)", {
        operationId: "rastreameLancarSemanal",
        requestBody: jsonBody(
          {
            inicio: { type: "string", format: "date" },
            fim: { type: "string", format: "date" },
            prazoDias: { type: "integer", default: 90 },
            execute: { type: "boolean", description: "false = preview" },
            info: { type: "string" },
            dataIso: { type: "string", format: "date-time" },
          },
          ["inicio", "fim"],
        ),
      }),
    }),
  };
}

function pathsPagbank(): OpenApiPaths {
  return {
    "/api/pagbank/check": pathItem({
      get: op("get", "PagBank", "Verificar sessão PagBank", {
        operationId: "pagbankCheck",
      }),
    }),
    "/api/pagbank/creditos": pathItem({
      get: op("get", "PagBank", "Listar créditos do extrato", {
        operationId: "pagbankCreditos",
        parameters: [
          refParam("InicioDateQuery"),
          refParam("FimDateQuery"),
          refParam("PaginaQuery"),
        ],
      }),
    }),
    "/api/pagbank/match": pathItem({
      get: op("get", "PagBank", "Cruzar créditos com despesas em aberto", {
        operationId: "pagbankMatchGet",
        parameters: [refParam("InicioDateQuery"), refParam("FimDateQuery")],
      }),
      post: op("post", "PagBank", "Cruzar créditos (body JSON)", {
        operationId: "pagbankMatchPost",
        requestBody: jsonBody({
          inicio: { type: "string", format: "date" },
          fim: { type: "string", format: "date" },
        }),
        requestBodyRequired: false,
      }),
    }),
  };
}

function pathsPedagio(): OpenApiPaths {
  return {
    "/api/pedagio/veiculos": pathItem({
      get: op("get", "Pedágio Digital", "Listar placas no portal", {
        operationId: "pedagioListarVeiculos",
      }),
      post: op("post", "Pedágio Digital", "Cadastrar placa no portal", {
        operationId: "pedagioRegistrarVeiculo",
        requestBody: jsonBody(
          {
            placa: { type: "string" },
            modelo: { type: "string" },
            marca: { type: "string" },
            ano: { type: "string" },
            cor: { type: "string" },
          },
          ["placa"],
        ),
        responses: { "201": { $ref: "#/components/responses/Created" } },
      }),
    }),
    "/api/pedagio/veiculos/{placa}": pathItem({
      delete: op("delete", "Pedágio Digital", "Excluir placa do portal", {
        operationId: "pedagioExcluirVeiculo",
        parameters: [
          pathParam("placa"),
          query("dryRun", { type: "boolean" }),
        ],
      }),
    }),
    "/api/pedagio/passagens": pathItem({
      get: op("get", "Pedágio Digital", "Listar passagens de uma placa", {
        operationId: "pedagioPassagens",
        parameters: [
          query("placa", { type: "string" }, "Obrigatória"),
          query("status", { type: "string", enum: ["aberto", "pago", "todos"], default: "aberto" }),
        ],
      }),
    }),
    "/api/pedagio/conferir": pathItem({
      get: op("get", "Pedágio Digital", "Conferir placas local vs portal", {
        operationId: "pedagioConferir",
      }),
      post: op("post", "Pedágio Digital", "Conferir e opcionalmente registrar faltantes", {
        operationId: "pedagioConferirRegistrar",
        requestBody: jsonBody({ registrar: { type: "boolean" } }),
        requestBodyRequired: false,
      }),
    }),
  };
}

export function buildOpenApiPaths(): OpenApiPaths {
  return mergePaths(
    pathsSistema(),
    pathsClientes(),
    pathsVeiculos(),
    pathsContratos(),
    pathsDespesas(),
    pathsParceiroDespesas(),
    pathsLocacoes(),
    pathsInfracoes(),
    pathsRecebimentos(),
    pathsRelatorios(),
    pathsSync(),
    pathsImportacoes(),
    pathsAnaliseCadastro(),
    pathsFipe(),
    pathsParceiros(),
    pathsRenegociacao(),
    pathsRastreame(),
    pathsPagbank(),
    pathsPedagio(),
  );
}
