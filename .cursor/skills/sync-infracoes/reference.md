# sync-infracoes — referência

Auth, endpoints e classificação de `debitos[]`: **`.cursor/tools/detran-sc/reference.md`**.

## Campos em cliente-despesas.json

| Campo | Uso no encerramento |
|-------|---------------------|
| `autoInfracao` | Chave única |
| `veiculoId` | Placa |
| `condutorId` / `condutorContrato` | Filtrar multas do locatário |
| `dataAutuacao` | Período do contrato |
| `valorMulta` | Valor cobrável |
| `quitadaDetran` | Paga no DETRAN — não cobrar |
| `paga` | Locatário quitou com a Lanza |
| `condutorConfirmado` | `false` → revisar antes de cobrar |

## Confirmar condutor

```bash
npx tsx src/run.ts gravar-cliente-despesa confirmar <autoInfracao>
```

## Relatório de lote

`relatorios/sync/_sync_infracoes.json` — resumo por placa (`novos`, `atualizados`, avisos).

## Não confundir com

- **sync-ipva-licenciamento** → `parceiro-despesas.json` (dono do veículo).
- **cadastro-despesa** → lançamento manual (não substitui sync DETRAN).
