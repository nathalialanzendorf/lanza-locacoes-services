import {
  badRequest,
  compileRoute,
  json,
  parseAtivoQuery,
  readJsonBody,
  routeAsync,
  type RouteDef,
} from "../http.js";
import * as cobrancasRel from "../services/relatorios/cobrancas.js";
import * as encerramentoRel from "../services/relatorios/encerramento.js";
import * as prestacaoRel from "../services/relatorios/prestacaoContas.js";
import { listarEscoposContratosAtivos } from "../services/relatorios/filtro.js";
import * as infracoesRel from "../services/relatorios/infracoes.js";

export function registerRelatoriosRoutes(routes: RouteDef[]): void {
  const meta = compileRoute("/api/relatorios/cobrancas/meta");
  routes.push({
    method: "GET",
    pattern: meta.regex,
    paramNames: meta.paramNames,
    handler: (ctx) => json(ctx.res, 200, cobrancasRel.metaCobrancas()),
  });

  const escopos = compileRoute("/api/relatorios/cobrancas/escopos");
  routes.push({
    method: "GET",
    pattern: escopos.regex,
    paramNames: escopos.paramNames,
    handler: (ctx) => {
      const items = listarEscoposContratosAtivos();
      json(ctx.res, 200, { total: items.length, items });
    },
  });

  const alvos = compileRoute("/api/relatorios/cobrancas/alvos");
  routes.push({
    method: "GET",
    pattern: alvos.regex,
    paramNames: alvos.paramNames,
    handler: (ctx) => {
      const tipo = ctx.query.get("tipo");
      if (!tipo) {
        return badRequest(ctx, 'Query "tipo" é obrigatória');
      }
      const data = cobrancasRel.listarAlvos(tipo, {
        placa: ctx.query.get("placa") ?? undefined,
        clienteId: ctx.query.get("clienteId") ?? undefined,
        clienteQuery: ctx.query.get("cliente") ?? undefined,
      });
      json(ctx.res, 200, data);
    },
  });

  const cobrancas = compileRoute("/api/relatorios/cobrancas");
  routes.push({
    method: "POST",
    pattern: cobrancas.regex,
    paramNames: cobrancas.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<cobrancasRel.GerarCobrancasInput>(ctx.req);
      if (ctx.query.get("listar") === "true") {
        const tipos = body.tipos?.length ? body.tipos : ["pagamento-semanal"];
        const listagens = tipos.map((tipo) =>
          cobrancasRel.listarAlvos(tipo, body.filtro),
        );
        json(ctx.res, 200, { listagens });
        return;
      }
      const data = cobrancasRel.gerarCobrancas(body);
      json(ctx.res, 200, { data });
    }),
  });

  const placa = compileRoute("/api/relatorios/cobrancas/placa");
  routes.push({
    method: "POST",
    pattern: placa.regex,
    paramNames: placa.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<cobrancasRel.GerarCobrancaPlacaInput>(ctx.req);
      const data = cobrancasRel.gerarCobrancaPlaca(body);
      json(ctx.res, 200, { data });
    }),
  });

  const semanalAtraso = compileRoute("/api/relatorios/cobrancas/semanal-atraso");
  routes.push({
    method: "POST",
    pattern: semanalAtraso.regex,
    paramNames: semanalAtraso.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<cobrancasRel.SemanalAtrasoInput>(ctx.req);
      const salvar = parseAtivoQuery(ctx.query.get("salvar"));
      const data = cobrancasRel.gerarSemanalAtraso({
        ...body,
        salvar: salvar ?? body.salvar,
      });
      json(ctx.res, 200, { data });
    }),
  });

  const infracoes = compileRoute("/api/relatorios/infracoes");
  routes.push({
    method: "GET",
    pattern: infracoes.regex,
    paramNames: infracoes.paramNames,
    handler: (ctx) => json(ctx.res, 200, { data: infracoesRel.relatorioInfracoes() }),
  });

  const encerramento = compileRoute("/api/relatorios/encerramento");
  routes.push({
    method: "POST",
    pattern: encerramento.regex,
    paramNames: encerramento.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody<encerramentoRel.GerarEncerramentoInput>(ctx.req);
      const data = encerramentoRel.gerarEncerramento(body);
      json(ctx.res, 200, { data });
    }),
  });

  const prestacao = compileRoute("/api/relatorios/prestacao-contas");
  routes.push({
    method: "POST",
    pattern: prestacao.regex,
    paramNames: prestacao.paramNames,
    handler: routeAsync(async (ctx) => {
      const body = await readJsonBody(ctx.req);
      const data = prestacaoRel.gerarPrestacaoContas(body);
      json(ctx.res, 200, { data });
    }),
  });
}
