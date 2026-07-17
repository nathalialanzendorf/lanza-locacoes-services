---
name: sync-fipe
description: >-
  Atualiza campos FIPE (código, modelo, valor, referência) em database/veiculos.json
  para a frota ativa ou uma placa. Sync separado do sync-rastreaveis (Rastreame).
  Use para sync FIPE, atualizar FIPE, fipe frota ou após sync-rastreaveis.
---

# Sync FIPE — veiculos.json

Consulta a API FIPE e grava `fipe`, `fipeCodigo`, `fipeModelo`, `fipeValor`, `fipeReferencia` em `database/veiculos.json`.

**Separado** de `sync-rastreaveis` (Rastreame). Rode após importar veículos novos do Rastreame.

## CLI

```bash
npx tsx src/run.ts sync-fipe
npx tsx src/run.ts sync-fipe --placa ABC1D23
npx tsx src/run.ts sync-fipe --faltantes
npx tsx src/run.ts sync-fipe --faltantes --dry-run
```

Alias legado: `atualizar-fipe-veiculos`.

## Regras

- **Só veículos ativos** na frota completa (sem `--placa`).
- Com `--placa`, honra pedido explícito mesmo se inativo.
- Tool: `.cursor/tools/fipe/`

## Skills relacionadas

- **sync-veiculo** — Rastreame ↔ veiculos.json (sem FIPE)
- **cadastro-veiculo** — cadastro manual + consulta FIPE pontual na web
