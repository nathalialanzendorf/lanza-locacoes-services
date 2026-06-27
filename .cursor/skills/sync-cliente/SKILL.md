---
name: sync-motoristas
description: >-
  Syncs Rastreame motoristas with database/clientes.json. Local DB is source of
  truth. Idempotent pull/push. Use for sync motoristas, clientes Rastreame.
---

# Sync motoristas — Rastreame ↔ clientes.json

## CLI

```bash
npx tsx src/run.ts sync-motoristas
npx tsx src/run.ts sync-motoristas --dry-run --pull-only
```

## Idempotência

- **Pull:** `rastreameMotoristaKey` → CPF → CNH.
- **Push:** PUT por key; antes de POST usa `findMotorista(cnh, nome)`.
- Reexecutar é seguro — ver [`_idempotencia.md`](../_idempotencia.md).

## Skills relacionadas

- **cadastro-cliente**, **importar-clientes-rastreame**, **rastreame-site**
