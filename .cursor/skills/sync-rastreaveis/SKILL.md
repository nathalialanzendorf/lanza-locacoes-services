---
name: sync-rastreaveis
description: >-
  Syncs Rastreame rastreáveis (vehicles) with database/veiculos.json. Local DB
  is source of truth. Idempotent pull/push. Use for sync rastreáveis, veículos Rastreame.
---

# Sync rastreáveis — Rastreame ↔ veiculos.json

## CLI

```bash
npx tsx src/run.ts sync-rastreaveis
npx tsx src/run.ts sync-rastreaveis --dry-run --push-only
```

## Idempotência

- **Pull:** `rastreameRastreavelKey` → `placa`.
- **Push:** PUT por key; antes de POST procura rastreável remoto com a mesma placa.
- Reexecutar é seguro — ver [`_idempotencia.md`](../_idempotencia.md).

## Skills relacionadas

- **cadastro-veiculo**, **rastreame-site**
