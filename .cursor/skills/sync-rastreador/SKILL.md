---
name: sync-rastreador
description: >-
  Lança rastreador fixo mensal (R$ 50, dia 10) para todos os veículos em
  veiculos.json em database/parceiro-despesas.json. Idempotente — pode
  reexecutar sem duplicar. Use quando pedir sync rastreador, taxa rastreador
  mensal, ou antes de relatorio-prestacao-contas.
---

# Sync rastreador — taxa mensal fixa

Grava **Rastreador** em `database/parceiro-despesas.json` para **cada veículo** de `database/veiculos.json`, **por competência** (mês).

## Regra fixa (padrão)

| Campo | Valor |
|-------|-------|
| `categoria` | `Rastreador` |
| `descricao` | `Rastreador` |
| `valor` | **R$ 50,00** (todos os meses) |
| `data` | **dia 10** do mês da competência (`10/MM/AAAA`) |
| `competencia` | `MM/AAAA` |

## Idempotência

- Chave lógica: **placa + competência + categoria Rastreador**.
- `origem`: `rastreador-fixo/{PLACA}/{MM-AAAA}` — única por veículo/mês.
- Reexecutar **atualiza** valor/data se divergirem; **não duplica**.
- Duplicatas antigas (mesma placa/mês) são removidas, mantendo o registo canónico.

## CLI

```bash
npx tsx src/run.ts sync-rastreador
npx tsx src/run.ts sync-rastreador --desde 01/2026 --ate 06/2026
npx tsx src/run.ts sync-rastreador --dry-run
```

Por defeito: `--desde 01/2026` até o **mês corrente**.

## Fluxo do agente

1. Correr `sync-rastreador` (ou `--dry-run` para pré-visualizar).
2. Confirmar resumo: `N veículos × M meses`, novos/atualizados/sem alteração.
3. Novos veículos em `veiculos.json` entram automaticamente na próxima execução.

## Destino

- **Ficheiro:** `database/parceiro-despesas.json`
- **Código:** `src/lib/rastreadorFixo.ts`, `src/cli/syncRastreador.ts`

## Skills relacionadas

- **relatorio-prestacao-contas** — consome rastreador da base (fallback R$ 50 se faltar).
- **cadastro-veiculo** — novo veículo passa a receber lançamentos no próximo sync.
- **sync-seguro** — seguro vem dos PDFs (valor variável por veículo); **não** confundir com rastreador.
- [`_idempotencia.md`](../_idempotencia.md) — regra transversal.
