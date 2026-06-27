# Tool — DETRAN SC (Detran Digital)

API `transito-api` em [servicos.detran.sc.gov.br](https://servicos.detran.sc.gov.br/). Consulta **placa + RENAVAM** de `database/veiculos.json`.

Dois comandos CLI (mesma auth, destinos diferentes):

| CLI | Destino | Doc |
|-----|---------|-----|
| `sync-infracoes` | `database/cliente-despesas.json` (Infração) | [infracoes.md](infracoes.md) |
| `sync-ipva-licenciamento` | `database/parceiro-despesas.json` (IPVA, Licenciamento) | [ipva-licenciamento.md](ipva-licenciamento.md) |

Referência API: [reference.md](reference.md)

## Autenticação (`.env`)

| Variável | Uso |
|----------|-----|
| `DETRAN_SC_AUTH` | JWT Bearer (sem prefixo `Bearer` no valor) |
| `DETRAN_SC_EMPRESA` | Header `X-Empresa` |
| `DETRAN_SC_APP_VERSION` | Opcional — header `X-App-Version` |

Token expira (~5 h). **Nunca** versionar no Git.

## Resumo rápido

```bash
# Infrações (locatário)
npx tsx src/run.ts sync-infracoes [--placa PLACA] [--dry-run]

# IPVA / licenciamento (parceiro)
npx tsx src/run.ts sync-ipva-licenciamento [--placa PLACA] [--dry-run]
```

Relatórios de lote: `relatorios/sync/_sync_infracoes.json`, `relatorios/sync/_sync_ipva_licenciamento.json`.

## Semântica `debitos[]` (mesma resposta API)

| Tipo no JSON | sync-infracoes | sync-ipva-licenciamento |
|--------------|----------------|-------------------------|
| Multa com auto | ✅ cliente-despesas | ❌ ignorar |
| IPVA | ❌ ignorar | ✅ parceiro-despesas |
| Licenciamento | ❌ ignorar | ✅ parceiro-despesas |

## Código

`src/lib/detranSc/` — `auth.ts`, `consulta.ts`, `mapInfracoes.ts`, `mapDebitosProprietario.ts`, `syncVeiculo.ts`, `syncDespesasVeiculo.ts`

## Skills que usam esta tool

| Skill | CLI | Destino |
|-------|-----|---------|
| **sync-infracoes** | `sync-infracoes` | `database/cliente-despesas.json` |
| **sync-ipva-licenciamento** | `sync-ipva-licenciamento` | `database/parceiro-despesas.json` |

Outras skills relacionadas (consomem o JSON, não rodam sync):

- **cadastro-veiculo** — `renavam` obrigatório para consulta.
- **relatorio-encerramento-contrato** — infrações em `cliente-despesas.json`.
- **cadastro-despesa** — lançamento manual IPVA/licenciamento.
- **relatorio-prestacao-contas** — consome `parceiro-despesas.json`.
