#!/usr/bin/env node
/**
 * Ponto único de entrada para ferramentas Lanza (TypeScript).
 *
 * Na raiz do repositório (após `npm install`):
 *   npx tsx src/run.ts <comando> [args...]
 */
async function run(): Promise<void> {
  const cmd = process.argv[2];
  const rest = process.argv.slice(3);

  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(`Uso: npx tsx src/run.ts <comando> [args...]

Comandos:
  merge-veiculo <novo.json> <dono>
  merge-cliente <cliente.json>
  gravar-despesa <categoria> <valor> <data> <placa> [descricao]
  sync-seguro <boletos.json>
  montar-relatorio <entrada.json>
  rastreame check <cnh> [nome] | rastreame add <cliente.json>
  rastreame-gastos list [--page 0] [--size 50] | post <corpo.json> | put <id> <corpo.json>
  rastreame-lancar-semanal [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--prazo-dias N] [--execute]
  fipe marca <texto> | fipe modelos <code> [filtros...] | fipe anos ... | fipe valor ...
  atualizar-fipe-veiculos [--placa PLACA]
  sincronizar-veiculos-crlv [--dry-run] [--placa PLACA]
  gerar-contrato <dados.json>
  gerar-contrato --placa PLACA --cpf CPF --semana N --caucao N [--periodo "3 meses"] [--cnh-arquivo PATH]
  gravar-cliente-despesa <lote.json> | gravar-cliente-despesa confirmar <autoInfracao> [condutorId]
  sync-infracoes [--placa PLACA] [--dry-run] [--ticket UUID] [--json resposta.json]
  sync-ipva-licenciamento [--placa PLACA] [--dry-run] [--ticket UUID] [--json resposta.json]
  encerrar-contrato <pasta-contrato> --encerramento DD/MM/AAAA | encerrar-contrato <entrada.json>
  renegociar-debitos resumo --motorista <key> --rastreavel <key>
  renegociar-debitos <entrada.json> [--execute]
`);
    process.exit(cmd ? 0 : 1);
  }

  switch (cmd) {
    case "merge-veiculo":
      await (await import("./cli/mergeVeiculo.js")).main(rest);
      break;
    case "merge-cliente":
      (await import("./cli/mergeCliente.js")).main(rest);
      break;
    case "gravar-despesa":
      (await import("./cli/gravarDespesa.js")).main(rest);
      break;
    case "sync-seguro":
      (await import("./cli/syncSeguro.js")).main(rest);
      break;
    case "montar-relatorio":
      (await import("./cli/montarRelatorio.js")).main(rest);
      break;
    case "rastreame-gastos":
      await (await import("./cli/rastreameGastos.js")).main(rest);
      break;
    case "rastreame":
      await (await import("./cli/rastreame.js")).main(rest);
      break;
    case "rastreame-lancar-semanal":
      await (await import("./cli/rastreameLancarSemanal.js")).main(rest);
      break;
    case "fipe":
      await (await import("./cli/fipe.js")).main(rest);
      break;
    case "atualizar-fipe-veiculos":
      await (await import("./cli/atualizarFipeVeiculos.js")).main(rest);
      break;
    case "sincronizar-veiculos-crlv":
      await (await import("./cli/sincronizarVeiculosCrlv.js")).main(rest);
      break;
    case "gerar-contrato":
      (await import("./cli/gerarContrato.js")).main(rest);
      break;
    case "gravar-cliente-despesa":
    case "gravar-infracao":
      (await import("./cli/gravarClienteDespesa.js")).main(rest);
      break;
    case "sync-infracoes":
      await (await import("./cli/syncInfracoes.js")).main(rest);
      break;
    case "sync-ipva-licenciamento":
      await (await import("./cli/syncIpvaLicenciamento.js")).main(rest);
      break;
    case "encerrar-contrato":
      (await import("./cli/encerrarContrato.js")).main(rest);
      break;
    case "renegociar-debitos":
      await (await import("./cli/renegociarDebitos.js")).main(rest);
      break;
    default:
      console.error("Comando desconhecido:", cmd);
      process.exit(1);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
