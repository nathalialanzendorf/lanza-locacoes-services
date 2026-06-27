---
name: cadastro-despesa
description: >-
  CRUD partner vehicle debits in database/parceiro-despesas.json (IPVA, insurance,
  maintenance, etc.). Use when registering, editing, or removing expenses in
  parceiro-despesas.json.
---

# Cadastro de despesa (parceiro)

Cadastra, edita e exclui **débitos do parceiro/dono** em `database/parceiro-despesas.json`.

## Operações

| Operação | Como |
|----------|------|
| **Cadastrar** | `gravar-despesa` (idempotente) ou sync DETRAN/sync-seguro/sync-rastreador |
| **Editar** | Repetir `gravar-despesa` com **mesma** placa + competência + categoria + descrição (atualiza) |
| **Excluir** | Remover entrada do JSON (confirmar com operador) |

## Sempre perguntar (nesta ordem)

1. **Tipo** — `Manutenção`, `Seguro`, `Rastreador`, `IPVA`, `Licenciamento` ou `Outros`.
2. **Valor** — R$ (ex.: `50,00`).
3. **Data** — DD/MM/AAAA.
4. **Veículo** — placa de `database/veiculos.json`.

Para `Outros`, pedir **descrição** curta. Nos demais, usar o nome do tipo salvo indicação contrária.

## Workflow

1. Coletar dados (listar placas de `veiculos.json`). Se a placa não existir, avisar e oferecer **cadastro-veiculo**; ainda assim é possível gravar com `veiculoId = null`.
2. Confirmar resumo antes de gravar.
3. Executar:

```bash
npx tsx src/run.ts gravar-despesa "Manutenção" "50,00" "10/06/2026" "MLX-2H34" "Conserto buzina"
```

Argumentos: `<categoria> <valor> <data> <placa> [descricao]`

## Idempotência

- **Chave manual:** `placa + competencia + categoria + descricao`.
- Repetir o mesmo comando **atualiza** o registo existente (`sem_alteracao` se nada mudou).
- Syncs automáticos (seguro, rastreador, DETRAN) têm chaves próprias — ver [`_idempotencia.md`](../_idempotencia.md).

## Critério de conclusão

- Registro em `database/parceiro-despesas.json` com `id` (UUID da **despesa**) e `veiculoId` = **uuid** do veículo em `veiculos.json` (ou `null` com aviso).

## Skills relacionadas

- **sync-ipva-licenciamento** — IPVA e Licenciamento em lote; skill **sync-ipva-licenciamento** (tool DETRAN).
- **sync-seguro** — seguro em lote.
- **relatorio-prestacao-contas** — consome `parceiro-despesas.json`.
- **cadastro-veiculo** — nova placa.
