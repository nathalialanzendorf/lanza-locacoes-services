---
name: renegociar-debitos
description: >-
  Calculates open debit totals for rental renegotiation, marks selected Rastreame
  Gastos Gerais with [NEGOCIADO X] via PUT, and creates DOCUMENTACAO installment
  lines ATRASADO Pagamento negociação - axb via POST. Use when the user asks
  renegociar débitos, negociação, valores em aberto rastreame, parcelas
  renegociação, or [NEGOCIADO].
---

# Renegociar débitos (Rastreame — Gastos gerais)

Skill para **renegociar débitos em aberto** de um locatário no **Rastreame** (Gastos Gerais):

1. **Calcular** o total dos débitos selecionados (e opcionalmente listar candidatos).
2. **Marcar** cada débito antigo com prefixo **`[NEGOCIADO X]`** no campo **`info`** (`PUT` com corpo completo).
3. **Criar** as novas parcelas da negociação com **`POST`**, tipo **`DOCUMENTACAO`**, texto **`ATRASADO Pagamento negociação - {a}x{b}`**.

**Listagem (UI):** [Gastos — listagem](https://rastreame.com.br/#/gastos/list)

## Autenticação e execução no site

- **Nunca** colar tokens JWT, cookies ou `curl` com sessão no repositório.
- **Auth** e comandos HTTP: tool `.cursor/tools/rastreame/` (referência técnica).

## Quando usar

- Cliente pede **renegociar** parcelas / multas / outros débitos lançados no Rastreame.
- Operador quer **fechar débitos antigos** (marcar como negociados) e **lançar novo plano de parcelas**.
- Complemento opcional ao **relatorio-encerramento-contrato** (cálculo local de multas/atrasos) — aqui o foco é o **controlo financeiro no Rastreame**.

## Fluxo do agente

### 1. Identificar motorista e rastreável

- **`motorista.key`** e **`rastreavel.key`**: capturar na UI ao editar um gasto existente (DevTools → Network) ou via listagem.
- Cruzar com `database/clientes.json` / contrato / veículo quando ajudar a confirmar o par correto.

### 2. Levantar débitos em aberto (opcional)

```bash
npx tsx src/run.ts renegociar-debitos resumo --motorista <key> --rastreavel <key>
```

Lista gastos com **`total > 0`**, mesmo motorista/rastreável, cujo **`info`** **não** começa por **`[NEGOCIADO`**. Mostra IDs e total.

O operador escolhe quais entram na negociação (`gastosIds`).

### 3. Acordar plano de parcelas

- **`negociacaoCodigo`**: valor **X** em **`[NEGOCIADO X]`** (ex.: `"1"`, `"2"` — usar código único por acordo).
- **`parcelas[]`**: cada item com `numero`, `totalParcelas`, `valor`, `data` (YYYY-MM-DD).
- **Validar** que a soma das parcelas ≈ total dos débitos selecionados (tolerância R$ 0,02); se diferir, confirmar com o operador antes de `--execute`.

### 4. Montar JSON e dry-run

Gravar em `relatorios/_renegociacao_<cliente>.json` (schema em `reference.md`).

```bash
npx tsx src/run.ts renegociar-debitos relatorios/_renegociacao_<cliente>.json
```

Dry-run mostra:
- totais dos débitos selecionados;
- preview de cada **`PUT`** (`info` antes → depois);
- preview de cada **`POST`** de parcela.

### 5. Executar no Rastreame

Só após confirmação explícita do operador:

```bash
npx tsx src/run.ts renegociar-debitos relatorios/_renegociacao_<cliente>.json --execute
```

## Regras de negócio

### Marcação dos débitos antigos (`PUT`)

| Campo | Regra |
|-------|--------|
| **`info`** | Prefixar **`[NEGOCIADO X]`** + espaço + texto original. Se já começar com `[NEGOCIADO`, não duplicar. |
| **Corpo** | **GET** do gasto por id → alterar só `info` → **PUT** corpo completo (como a UI). |
| **`tipo`** | Manter o tipo original do débito (não alterar para DOCUMENTACAO). |

Exemplo: `ATRASADO - Pagamento semanal - Segunda 22` → `[NEGOCIADO 1] ATRASADO - Pagamento semanal - Segunda 22`

### Novas parcelas (`POST`)

| Campo | Regra |
|-------|--------|
| **`tipo`** | **`DOCUMENTACAO`** (`"tipo":{"key":"DOCUMENTACAO"}`). |
| **`info`** | **`ATRASADO Pagamento negociação - {a}x{b}`** — `{a}` = número da parcela, `{b}` = total de parcelas. |
| **`total`** | Valor da parcela. |
| **`data`** | Data de vencimento (YYYY-MM-DD → 23:59 Recife, padrão Lanza). |
| **`motorista` / `rastreavel`** | Mesmos `key` da negociação. |

### Duplicados

Antes de **`POST`**, verificar se já existe gasto com o mesmo **`info`**, **`motorista.key`** e **`rastreavel.key`**. Se existir, **não** duplicar — reportar aviso.

## Código e CLI

| Peça | Caminho |
|------|---------|
| Lógica | `src/lib/rastreame/renegociacao.ts` |
| GET gasto / list | `src/lib/rastreame/gasto.ts` (`fetchGastoById`, `fetchAllGastos`) |
| CLI | `npx tsx src/run.ts renegociar-debitos …` |

Detalhe de JSON e exemplos: **`reference.md`** nesta pasta.
