---
name: relatorio-encerramento-contrato
description: >-
  Calculates vehicle rental contract closure report only (no database writes):
  unpaid fines, overdue rent, daily late fees, deposit retention, final balance.
  Use for encerramento de contrato, acerto final, retenção caução, multas do locatário.
  To record closure use cadastro-contrato encerrar.
---

# Relatório de encerramento de contrato

Calcula o **acerto** de um contrato: multas, parcelas em aberto, diárias de atraso, retenção de caução e saldo final.

**Só o contrato vigente:** último `Contrato*.docx` na pasta (maior `vN`) e, se existir em `contratos.json`, a maior `versao` do par locatário+veículo. Renovações anteriores não entram no cálculo.

**Não grava** em `database/contratos.json`. Para efetivar encerramento → skill **cadastro-contrato** (`encerrar`).

**Idempotência:** skill só leitura — reexecutar gera o mesmo relatório; não altera bases.

> **Veículos particulares** (`"particular": true` em `veiculos.json`) não têm contrato de locação — `calcularEncerramentoContrato` recusa essas placas.

## Quando usar

- Simular ou apresentar acerto antes de devolver caução.
- Conferir multas cobráveis no período da locação.
- Validar semanas pagas e débitos pendentes.

## Perguntas (ordem)

1. **Pasta do contrato** — `DD.MM.AAAA - Nome` em `contratosDir`.
2. **Data de encerramento** — `DD/MM/AAAA`.
3. **Semanas já pagas** — lista `DD/MM/AAAA` (cruzar com **cadastro-recebimento** / Rastreame).
4. **Multas já pagas** — autos a excluir.
5. **Confirmar condutores** — `condutorConfirmado: false` exige revisão.

## Executar (CLI)

```bash
npx tsx src/run.ts relatorio-encerramento-contrato "D:/Dropbox/Aluguel Carros/.../05.05.2026 - Nome" --encerramento 26/06/2026
```

Grava automaticamente em **`relatorios/quebra-contrato/`**:

- `quebra-contrato-{placa}-{cliente}-{DD-MM-AAAA}.txt` — documento para partilhar com o locatário (como prestação de contas com parceiros)

Com JSON de **entrada** (semanas pagas, etc.) — o JSON é só parâmetro, não é gerado como saída:

```bash
npx tsx src/run.ts relatorio-encerramento-contrato relatorios/_tmp/_encerramento_tmp.json
```

`--out` sobrescreve o `.txt`; `--out-json` grava JSON opcional (ex. rascunho em `_tmp/`); `--no-salvar` só imprime no terminal.

Exemplo `entrada.json`:

```json
{
  "pastaContrato": "D:/Dropbox/Aluguel Carros/.../05.05.2026 - Nome",
  "dataEncerramento": "26/06/2026",
  "semanasPagas": ["12/05/2026"],
  "infracoesPagasAuto": [],
  "incluirTodasInfracoesPlaca": false
}
```

## Após o relatório

1. Validar multas e semanas com o operador.
2. **Efetivar encerramento:** `cadastro-contrato encerrar` com `--data`, `--motivo devolvido|recuperado`, `--quebra` se aplicável.
3. Marcar multas quitadas em `cliente-despesas.json`; lançamentos Rastreame via **cadastro-recebimento**.

## Fórmulas

| Item | Cálculo |
|------|---------|
| **Diária** | valor semanal ÷ 7 |
| **Multas** | `cliente-despesas.json`, categoria Infração, não pagas, no período |
| **Parcelas em aberto** | Vencimentos semanais não listados em `semanasPagas` |
| **Retenção caução** | caução × (diasRestantes ÷ prazoDias) |
| **Saldo** | caução − total débitos |

> **Infrações fora do cálculo:** as **quitadas no DETRAN** (`quitadaDetran: true`) e as **sem data de autuação** (não há como comparar com a vigência) **não entram** na cobrança do locatário — só multas **com data**, **não quitadas** e **não pagas**, no período. (Ver regra em **sync-infracoes**.)

Detalhes: `reference.md` nesta pasta.

## Skills relacionadas

- **cadastro-contrato** — gerar contrato e **efetivar** encerramento no database.
- **cadastro-recebimento** — parcelas pagas.
- **sync-infracoes** — multas em `cliente-despesas.json` (skill + tool DETRAN).

## Alias legado

`encerrar-contrato` → `relatorio-encerramento-contrato` (só cálculo; grava em `relatorios/`).
