---
name: sync-ipva-licenciamento
description: >-
  Syncs IPVA and Licenciamento debits from DETRAN SC into database/parceiro-despesas.json
  for partner accountability. Uses tool .cursor/tools/detran-sc/.
  Use when syncing IPVA, licenciamento, débitos proprietário DETRAN, or before relatorio-prestacao-contas.
---

# Sync IPVA / licenciamento — DETRAN SC → parceiro-despesas.json

Skill de **negócio**: trazer **IPVA** e **Licenciamento** do DETRAN SC para `database/parceiro-despesas.json` (despesas do **parceiro/dono**). Alimenta **relatorio-prestacao-contas**.

**Execução técnica** (auth, API, classificação de `debitos[]`): tool **`.cursor/tools/detran-sc/`** — ler [README.md](../../tools/detran-sc/README.md) e [ipva-licenciamento.md](../../tools/detran-sc/ipva-licenciamento.md) antes de correr a CLI.

## Quando usar

- Utilizador pede **sync IPVA / licenciamento / débitos DETRAN do parceiro**.
- Antes de **relatorio-prestacao-contas** — validar despesas do mês.
- **Não** usar para multas de locatário → skill **sync-infracoes**.

## Semântica (resumo)

Mesma resposta API que **sync-infracoes**, destinos diferentes:

| Tipo em `debitos[]` | Esta skill | sync-infracoes |
|---------------------|------------|----------------|
| Multa / infração | ❌ ignorar | ✅ cliente-despesas |
| IPVA | ✅ parceiro-despesas | ❌ |
| Licenciamento | ✅ parceiro-despesas | ❌ |

## Fluxo do agente

1. Confirmar variáveis de ambiente do utilizador (DETRAN) — ver tool.
2. **Teste:** `sync-ipva-licenciamento --dry-run --placa PLACA`.
3. **Produção:** frota ou `--placa PLACA`.
4. Revisar `relatorios/sync/_sync_ipva_licenciamento.json`.
5. Lançamento manual pontual → **cadastro-despesa** (`gravar-despesa`).

## CLI

```bash
npx tsx src/run.ts sync-ipva-licenciamento
npx tsx src/run.ts sync-ipva-licenciamento --placa MKV-6268
npx tsx src/run.ts sync-ipva-licenciamento --dry-run --placa MKV-6268
```

## Destino

| Campo | Valor |
|-------|-------|
| `categoria` | `IPVA` ou `Licenciamento` |
| `origem` | `detran-sc/debitos/{PLACA}/{categoria}/{id}` |
| Ficheiro | `database/parceiro-despesas.json` |

Detalhes: [reference.md](reference.md) e `.cursor/tools/detran-sc/`.

## Skills relacionadas

- **sync-infracoes** — multas → `cliente-despesas.json`.
- **relatorio-prestacao-contas** — consome `parceiro-despesas.json`.
- **cadastro-despesa** — CRUD manual de despesas do parceiro.
