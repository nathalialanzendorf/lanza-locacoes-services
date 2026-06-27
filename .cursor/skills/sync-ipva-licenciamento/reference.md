# sync-ipva-licenciamento — referência

Auth e API: **`.cursor/tools/detran-sc/reference.md`** (mesma base que sync-infracoes).

## Schema gravado (parceiro-despesas.json)

| Campo | Origem |
|-------|--------|
| `categoria` | `IPVA` ou `Licenciamento` |
| `veiculoId` | Placa |
| `valor` | Débito DETRAN |
| `data` | Vencimento / competência |
| `competencia` | `MM/AAAA` quando aplicável |
| `origem` | Idempotência — não duplicar |

## Relatório de lote

`relatorios/sync/_sync_ipva_licenciamento.json`

## Classificação debitos[] (resumo)

Ver tabela completa em `.cursor/tools/detran-sc/reference.md`.

- Texto com `numeroAuto` ou multa → **sync-infracoes**, não esta skill.
- DPVAT, taxa DETRAN, CRLV → ignorar em ambas as syncs.

## Lançamento manual

Skill **cadastro-despesa** — quando o débito não veio do DETRAN ou precisa de ajuste.
