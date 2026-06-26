---
name: encerrar-contrato
description: >-
  Calculates vehicle rental contract closure: unpaid traffic fines from
  database/cliente-despesas.json (categoria Infração), overdue weekly rent and daily late fees
  proportional deposit retention for early termination, and final balance.
  Use when the user asks fechamento de contrato, encerrar contrato, devolução
  do veículo, quitar locação, retenção caução, or multas do locatário no fechamento.
---

# Encerramento de contrato de locação

Calcula o **fechamento** de um contrato ativo: multas não pagas, **locação em atraso**, **diárias** após vencimento semanal, **retenção proporcional da caução** (quebra de contrato) e **saldo final** (caução − débitos).

## Quando usar

- Devolução antecipada do veículo (encerramento antes do fim do prazo).
- Acerto final com locatário antes de devolver caução.
- Conferência de multas de trânsito cobráveis no período da locação.

## Perguntas (ordem)

1. **Pasta do contrato** — `DD.MM.AAAA - Nome` em `contratosDir` (`config/lanza_paths.json`, padrão `D:\Dropbox\Aluguel Carros`). Deve conter `Contrato*.docx`.
2. **Data de encerramento** — devolução do veículo (`DD/MM/AAAA`).
3. **Semanas já pagas** — datas de vencimento quitadas (lista `DD/MM/AAAA`). Cruzar com Rastreame (**cadastrar-recebimento**) se possível.
4. **Multas já pagas pelo locatário** — autos a excluir (mesmo que `paga` ainda seja `false` em `cliente-despesas.json`).
5. **Confirmar condutores** — multas com `condutorConfirmado: false` exigem revisão antes de cobrar.

## Fórmulas

| Item | Cálculo |
|------|---------|
| **Diária** | `valorSemanal ÷ 7` (extraído do contrato `.docx`) |
| **Multas** | Soma de `database/cliente-despesas.json` com `categoria === "Infração"`, `paga !== true`, **`quitadaDetran !== true`**, placa do contrato, autuação entre início e encerramento, condutor = locatário (ou pasta do contrato) |
| **Parcelas em aberto** | Cada vencimento semanal (a cada 7 dias desde o início) **não** listado em `semanasPagas` e ≤ encerramento → `valorSemanal` |
| **Diárias por atraso** | Para cada parcela em aberto: `diasAtraso × diária`, onde `diasAtraso` = dias do vencimento até o encerramento |
| **Retenção caução** | `caução × (diasRestantes ÷ prazoDias)` — dias restantes = `prazoDias − diasLocação` |
| **Total débitos** | multas + parcelas em aberto + diárias atraso + retenção caução |
| **Saldo caução** | `caução − totalDébitos` (negativo → locatário deve complementar) |

### Exemplo retenção caução

Contrato **90 dias**, caução **R$ 1.500**, encerramento com **30 dias** de locação:

- Dias restantes: 60 → proporção 60/90 = 2/3  
- **Retenção: R$ 1.000** | Devolver após retenção: R$ 500 (antes de outros débitos)

## Executar (CLI)

Na raiz do repo:

```bash
npx tsx src/run.ts encerrar-contrato "D:/Dropbox/Aluguel Carros/.../05.05.2026 - Nome Cliente" --encerramento 09/06/2026
```

Com JSON (semanas pagas, multas pagas, etc.):

```bash
npx tsx src/run.ts encerrar-contrato relatorios/_fechamento_tmp.json --out relatorios/_fechamento_resultado.json
```

Exemplo `entrada.json`:

```json
{
  "pastaContrato": "D:/Dropbox/Aluguel Carros/Felipe - RENAULT SANDERO 2013-2014/05.05.2026 - Susana da Silva (troca 09.05.26)",
  "dataEncerramento": "09/06/2026",
  "semanasPagas": ["12/05/2026"],
  "infracoesPagasAuto": [],
  "incluirTodasInfracoesPlaca": false,
  "condutorId": null
}
```

## Após o cálculo

1. Apresentar o relatório textual ao operador e **validar** multas / semanas pagas.
2. Renomear pasta do contrato com sufixo operacional se aplicável: `devolvido`, `encerrado` (facilita exclusão em buscas futuras — ver `contratosAtivosSemana.ts`).
3. Marcar multas quitadas: `"paga": true`, `"pagaEm": "DD/MM/AAAA"` em `database/cliente-despesas.json`.
4. Lançamentos no Rastreame (quitação / acerto): skill **cadastrar-recebimento** + **rastreame-site**.

## Dependências

- `database/cliente-despesas.json` — skill **sync-infracoes** ou **gravar-cliente-despesa** (cadastro de infrações e outros débitos do locatário).
- Contrato Word gerado — skill **gerar-contrato**.
- Cliente em `database/clientes.json` — skill **cadastrar-cliente** (para `condutorId` nas multas).
- Detalhes de campos e edge cases: `reference.md` nesta pasta.

## Skills relacionadas

- **gerar-contrato** — origem dos valores (semana, caução, prazo).
- **gravar-cliente-despesa** / **confirmar condutor** — débitos do locatário.
- **cadastrar-recebimento** — parcelas semanais pagas ou em atraso no Rastreame.
