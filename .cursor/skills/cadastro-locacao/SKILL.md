---
name: cadastro-locacao
description: >-
  Gerencia a linha do tempo de uso dos veículos em database/locacoes.json
  (situação reserva | manutencao | locado, período, condutor, valor cobrado e
  valor pago ao parceiro) e SUGERE à prestação de contas o ganho de locação, o
  desconto de diárias paradas em manutenção e as diárias a pagar de um veículo
  reserva. Use ao registrar locação/reserva/manutenção, troca de veículo por
  manutenção, ou ao preparar a prestação de contas a partir de locacoes.json.
---

# Cadastro de locação + sugestão para prestação

Mantém `database/locacoes.json` (lib `src/lib/locacoesDb.ts`, CLI `locacoes`) e gera **sugestões** para a skill **relatorio-prestacao-contas**. A skill é **só leitura para o relatório**: calcula sugestões e **valida com o utilizador** — nunca monta o `entrada.json` sozinha.

## Modelo de dados

Cada registro é um **período de uso** de um veículo. Campos principais (schema completo em `locacoes.json` → `schemaLocacao`):

| Campo | Conteúdo |
|---|---|
| `situacao` | **`reserva`** \| **`manutencao`** \| **`locado`** |
| `inicio` / `fim` | `DD/MM/AAAA` (`fim` vazio = vigente/em aberto) |
| `condutor` | cliente (`clientes.json`) por nome/CPF/id — opcional em reserva/manutenção |
| `tipoLocacao` | `diaria` \| `semanal` \| `mensal` (em `locado`/`reserva`; vazio em manutenção) |
| `valorCobrado` | valor **por unidade** do tipo, cobrado do cliente |
| `valorPago` | valor **por unidade** repassado ao parceiro |
| `substituiPlaca` | numa **reserva**, a placa do veículo (em manutenção) que ela substitui |

**Taxa de controle:** `valorCobrado − valorPago` é a taxa que a locadora retém (tipicamente **R$ 150/semana** em veículo de parceiro). Em manutenção não há valores (veículo parado).

## Cadastrar / editar / excluir

```bash
# Locação semanal (cobra 500, repassa 350 → taxa 150/sem)
npx tsx src/run.ts locacoes add --placa MLN-0B87 --situacao locado \
  --inicio 01/06/2026 --tipo semanal --cobrado 500 --pago 350 --condutor "Fulano de Tal"

# Veículo parado em manutenção (período fechado)
npx tsx src/run.ts locacoes add --placa ABC-1D23 --situacao manutencao \
  --inicio 10/06/2026 --fim 16/06/2026 --obs "Troca de motor"

# Veículo reserva no lugar do que está em manutenção (diária paga ao parceiro)
npx tsx src/run.ts locacoes add --placa XYZ-9A88 --situacao reserva \
  --inicio 10/06/2026 --fim 16/06/2026 --tipo diaria --pago 71.42 --substitui ABC-1D23

npx tsx src/run.ts locacoes listar --placa MLN-0B87
npx tsx src/run.ts locacoes add --id <uuid> ...   # atualiza um registro existente
npx tsx src/run.ts locacoes excluir --id <uuid>
```

Sempre **confirmar o resumo** com o utilizador antes de gravar. Placa não cadastrada em `veiculos.json` grava com `veiculoId = null` (avisa); condutor não encontrado fica só pelo nome.

## Sugerir para a prestação de contas

Para preparar a prestação a partir da tabela, rodar:

```bash
npx tsx src/run.ts locacoes sugerir --competencia 06/2026          # mês inteiro
npx tsx src/run.ts locacoes sugerir --competencia 06/2026 --placa MLN-0B87
npx tsx src/run.ts locacoes sugerir --competencia 06/2026 --json   # objeto bruto
```

Por veículo no período, o comando devolve as **linhas prontas** (`ganhoItens` e `manutencaoItens`), todas valorizadas pelo **`valorPago`**:

- **`ganhoItens`** → uma linha por segmento `locado` e `reserva`, no formato `N semana(s)/diária(s) {locado|reserva} DD/MM até DD/MM (R$ X/sem)`. **Sem nome de cliente.**
- **`manutencaoItens`** → **uma linha por registro** de manutenção: `K diária(s) parado DD/MM até DD/MM (R$ valor)`, valorizado pela diária do `valorPago` do último locado. Sem segmento locado para valorizar, o comando avisa e o **valor deve ser perguntado**.

Unidades: `diaria` = 1 dia, `semanal` = 7 dias, `mensal` = dias do mês da competência. Dias são **inclusivos** (início e fim contam).

### Como levar para o `montar-relatorio`

A sugestão é insumo para o `entrada.json` da skill **relatorio-prestacao-contas** (validar antes). Copiar direto:

- `ganho.itens` ← `ganhoItens` (locado + reserva, por `valorPago`).
- `descontoManutencao.itens` ← `manutencaoItens` (uma linha por registro parado).

O `montar-relatorio` soma os `itens` para o total de cada bloco; não é preciso informar `valor` agregado.

## Idempotência

- Registros têm `id` (uuid). `add` **sem** `--id` cria; **com** `--id` atualiza. `sugerir` e `listar` são só leitura.

## Skills relacionadas

- **relatorio-prestacao-contas** — consome a sugestão (ganho, desconto de manutenção, diárias de reserva, período).
- **cadastro-contrato** — `contratoId` vincula a locação ao contrato; encerramento/troca de veículo reflete-se em novos períodos aqui.
- **cadastro-despesa** — gastos do veículo (seguro, IPVA, rastreador) continuam em `parceiro-despesas.json`.
