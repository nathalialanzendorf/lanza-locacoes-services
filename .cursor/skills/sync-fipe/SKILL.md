---
name: sync-fipe
description: >-
  Atualiza campos FIPE no PostgreSQL (lanza.veiculo_fipe) para todos os veículos
  da base ou uma placa. Sync separado do sync-rastreaveis (Rastreame).
  Use para sync FIPE, atualizar FIPE, fipe frota ou após sync-rastreaveis.
---

# Sync FIPE — PostgreSQL

Consulta a API FIPE e grava em `lanza.veiculo_fipe` (não usa `veiculos.json`).

**Separado** de `sync-rastreaveis` (Rastreame). Rode após importar veículos novos.

## CLI

```bash
npx tsx src/run.ts sync-fipe
npx tsx src/run.ts sync-fipe --placa ABC1D23
npx tsx src/run.ts sync-fipe --faltantes
```

Alias legado: `atualizar-fipe-veiculos`. Sempre grava (sem dry-run).

## API

```bash
POST /api/sync/fipe?async=true
```

Job em memória com `progress: { total, done, percent, sucesso, falhas }`.

## Regras

- **Todos os veículos** da base (ativos e inativos), salvo `--faltantes` (só sem FIPE).
- Com `--placa`, honra pedido explícito mesmo se inativo.
- Exige PostgreSQL (`assertRelationalStore`).
- Tool: `.cursor/tools/fipe/`

## Skills relacionadas

- **sync-veiculo** — Rastreame ↔ veículos
- **cadastro-veiculo** — cadastro manual + consulta FIPE pontual
