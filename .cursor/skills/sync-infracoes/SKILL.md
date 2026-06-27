---
name: sync-infracoes
description: >-
  Syncs traffic fines and infractions from DETRAN SC into database/cliente-despesas.json
  for tenant billing and contract closure. Uses tool .cursor/tools/detran-sc/.
  Use when syncing multas, infrações, DETRAN SC, cliente-despesas, or before relatorio-encerramento-contrato.
---

# Sync infrações — DETRAN SC → cliente-despesas.json

Skill de **negócio**: trazer multas e infrações do **DETRAN SC** para `database/cliente-despesas.json` (categoria `Infração`), para cobrança do locatário e **relatorio-encerramento-contrato**.

**Execução técnica** (auth, API, headers): tool **`.cursor/tools/detran-sc/`** — ler [README.md](../../tools/detran-sc/README.md) e [infracoes.md](../../tools/detran-sc/infracoes.md) antes de correr a CLI.

## Quando usar

- Utilizador pede **sync multas / infrações / DETRAN** para locatários.
- Antes de **relatorio-encerramento-contrato** — garantir multas atualizadas.
- Após cadastrar veículo — exige `renavam` em `database/veiculos.json`.

## Semântica (resumo)

| Origem DETRAN | Gravação |
|---------------|----------|
| `infracoes` (autuação) | Cobrável; `quitadaDetran: false` |
| `debitos` (multas) | Importar **só multas** (ignorar IPVA/licenciamento) |
| `historicoInfracoes` | `quitadaDetran: true` — não cobrar no encerramento |

`paga` = locatário pagou à Lanza (independente de `quitadaDetran`).

## Fluxo do agente

1. Confirmar variáveis de ambiente do utilizador: `DETRAN_SC_AUTH`, `DETRAN_SC_EMPRESA` (tool DETRAN).
2. **Teste:** `sync-infracoes --dry-run --placa PLACA`.
3. **Produção:** frota ou `--placa PLACA`.
4. Revisar `relatorios/sync/_sync_infracoes.json`.
5. Multas novas com `condutorConfirmado: false` → confirmar condutor antes de cobrar (`gravar-cliente-despesa confirmar <autoInfracao>`).

## CLI

```bash
npx tsx src/run.ts sync-infracoes
npx tsx src/run.ts sync-infracoes --placa QJB-0I83
npx tsx src/run.ts sync-infracoes --dry-run --placa QJB-0I83
```

Debug offline (resposta já capturada): `--json relatorios/_tmp/_detran_resposta.json` — ver tool.

## Destino

- **Ficheiro:** `database/cliente-despesas.json`
- **Chave:** `autoInfracao`
- **Campos:** `origem: detran-sc`, `categoria: Infração`

Detalhes de API e módulos: [reference.md](reference.md) e `.cursor/tools/detran-sc/reference.md`.

## Skills relacionadas

- **sync-ipva-licenciamento** — IPVA/licenciamento do **mesmo** portal → `parceiro-despesas.json` (não misturar).
- **relatorio-encerramento-contrato** — consome infrações (`paga`, `quitadaDetran`).
- **cadastro-veiculo** — `renavam` obrigatório para consulta DETRAN.
