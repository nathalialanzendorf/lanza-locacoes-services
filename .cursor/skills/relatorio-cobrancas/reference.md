# Cobrança semanal em atraso — referência

Fonte única da regra de negócio. Código: `src/lib/pagamentoSemanalCobranca.ts`.

## Quando aplicar

- Pagamento semanal **não realizado** (despesa `ATRASADO` em aberto).
- Operador pede valor devido, tabela de cobrança ou baixa integral com atraso.
- Skills **`relatorio-cobrancas`** e **`cadastro-recebimento`** referenciam aqui.

## Exemplo (Daniel MOBI — pagamento 30/06/2026)

Contrato: semanal R$ 650, diária atraso R$ 120 → juros e multa R$ 27,14/dia.

**Tabela 1** — venc. 20/06, período 20/06–26/06: todos **Atrasado** → total **R$ 840,00**.

**Tabela 2** — venc. 27/06, período 27/06–04/07: 27–30 **Atrasado**, 01–04 **Em dia** → total **R$ 851,43**.

**Total geral:** **R$ 1.691,43**.

## Resumo da cobrança WhatsApp

Antes da tabela e da mensagem, apresentar (implementado em `calcularResumoCobrancaSemanal`):

```
Pagamento semanal (dia 2 — aviso)
Vencimento em aberto: 29/06/2026
Data bloqueio: 02/07/2026
Total a receber: R$ 360,00 (3 dias atrasados + 0 em dia)
Juros e multa acumulados: R$ 81,42
```

Escalonamento (vencimento = D0):

| Data | WhatsApp |
|---|---|
| D0 | Sem mensagem (em prazo) |
| D+1 | Lembrete (dia 1) |
| D+2 | Aviso (dia 2) |
| D+3+ | Bloqueio (dia 3) |

- **Data bloqueio** = vencimento + **3 dias**.
- **Total a receber** = soma até **hoje** (data da cobrança).
- **Total geral** da tabela completa (até fim do período da parcela) permanece para baixa integral — usar `--data-pagamento` na baixa.

## Integração cadastro-recebimento

Ao montar `baixa-recebimento plano` para quitação integral de parcelas em atraso:

1. Rodar `relatorio-cobrancas semanal-atraso` com a **data do pagamento** prevista.
2. Usar **`totalGeral`** (ou soma das tabelas) como `--valor` na baixa.
3. Tabela de confirmação Rastreame continua no formato da skill cadastro-recebimento.

Não usar só `valorSemanal` da despesa quando houver juros e multa acumulados.
