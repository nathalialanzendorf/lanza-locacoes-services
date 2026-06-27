# sync-ipva-licenciamento — detalhe técnico (tool DETRAN SC)

> Fluxo de negócio: skill **`.cursor/skills/sync-ipva-licenciamento/`**. Esta página é auth/CLI/API.

Despesas do **parceiro/dono** (IPVA, Licenciamento). Alimenta **relatorio-prestacao-contas**.

Multas → usar [infracoes.md](infracoes.md), não esta sync.

## CLI

```bash
npx tsx src/run.ts sync-ipva-licenciamento
npx tsx src/run.ts sync-ipva-licenciamento --placa MKV-6268
npx tsx src/run.ts sync-ipva-licenciamento --dry-run --placa MKV-6268
```

Relatório: `relatorios/sync/_sync_ipva_licenciamento.json`.

## Schema gravado

| Campo | Valor |
|-------|-------|
| `categoria` | `IPVA` ou `Licenciamento` |
| `origem` | `detran-sc/debitos/{PLACA}/{categoria}/{id}` |
| `placa`, `valor`, `data`, `competencia` | Do débito DETRAN |

Lançamento manual: skill **cadastro-despesa** → `gravar-despesa`.

Ver [reference.md](reference.md) para classificação de `debitos[]`.
