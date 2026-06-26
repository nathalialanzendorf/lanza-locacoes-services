---
name: cadastrar-despesa
description: >-
  Registers a partner/owner vehicle debit in database/parceiro-despesas.json
  (IPVA, licensing, insurance, tracker, maintenance, etc.). Use when registering
  an expense, gasto, despesa, seguro, manutenção, IPVA, licenciamento, or updating
  parceiro-despesas.json.
---

# Cadastrar Despesa

Cadastra um **débito a cobrar do parceiro/dono** do veículo em `database/parceiro-despesas.json` (IPVA, Licenciamento, Seguro, Rastreador, Manutenção, etc.). Alimenta **relatorio-prestacao-contas**.

## Sempre perguntar (nesta ordem)

1. **Tipo** — `Manutenção`, `Seguro`, `Rastreador`, `IPVA`, `Licenciamento` ou `Outros`.
2. **Valor** — R$ (ex.: `50,00`).
3. **Data** — DD/MM/AAAA.
4. **Veículo** — placa de `database/veiculos.json`.

Para `Outros`, pedir **descrição** curta. Nos demais, usar o nome do tipo salvo indicação contrária.

## Workflow

1. Coletar dados (listar placas de `veiculos.json`). Se a placa não existir, avisar e oferecer **cadastrar-veiculo**; ainda assim é possível gravar com `veiculoId = null`.
2. Confirmar resumo antes de gravar.
3. Executar:

```bash
npx tsx src/run.ts gravar-despesa "Manutenção" "50,00" "10/06/2026" "MLX-2H34" "Conserto buzina"
```

Argumentos: `<categoria> <valor> <data> <placa> [descricao]`

## Critério de conclusão

- Registro em `database/parceiro-despesas.json` com `id` (UUID da **despesa**) e `veiculoId` = **uuid** do veículo em `veiculos.json` (ou `null` com aviso).

## Skills relacionadas

- **sync-ipva-licenciamento** — IPVA e Licenciamento em lote a partir do DETRAN SC.
- **sync-seguro** — seguro em lote.
- **relatorio-prestacao-contas** — consome `parceiro-despesas.json`.
- **cadastrar-veiculo** — nova placa.
