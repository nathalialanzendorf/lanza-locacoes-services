# Encerramento de contrato — referência

## Extração do contrato (`.docx`)

O CLI lê `Contrato*.docx` na pasta informada:

| Campo | Origem |
|-------|--------|
| Cliente | Nome após `DD.MM.AAAA -` na pasta |
| Placa | Cláusula 1.1 (`placa: …`) |
| CPF | Bloco LOCATÁRIO |
| Prazo (dias) | Cláusula 1.2 (`lapso temporal de validade de N dias`) |
| Início / fim | Cláusula 1.2 ou data da pasta + prazo |
| Valor semanal | Regex em `docxPlain.ts` |
| Caução | Texto próximo a “caução” ou fallback |
| Diária | `semana / 7` |

Se o prazo no Word diferir do real, ajustar manualmente ou corrigir o contrato antes do encerramento.

## Vencimentos semanais

Default: **primeiro vencimento = início + 7 dias**, depois a cada 7 dias até a data de encerramento.

Override no JSON: `"diasPrimeiroVencimento": 7`.

Para alinhar ao dia da semana do contrato (ex. “todos os sábados”), calcular `semanasPagas` com as datas reais de quitação no Rastreame.

## Multas elegíveis

Incluídas se **todas** forem verdade:

1. `veiculoId` = placa do contrato  
2. `paga !== true`, `quitadaDetran !== true` e auto não está em `multasPagasAuto`  
3. `dataAutuacao` ∈ [início contrato, encerramento]  
4. Condutor: `condutorId` = cliente **ou** `condutorContrato` = pasta deste contrato  

Com `"incluirTodasMultasPlaca": true`: todas as multas não pagas da placa no período (ignora condutor).

## Campos em `cliente-despesas.json`

```json
{
  "paga": false,
  "pagaEm": null,
  "quitadaDetran": false
}
```

Após acerto com locatário: `"paga": true`, `"pagaEm": "26/06/2026"`.

## Interpretação do saldo

```
totalDebitos = multas + parcelasEmAberto + diariasAtraso + retencaoCaucao
saldoFinal   = caucao - totalDebitos
```

- `saldoFinal > 0`: valor a **devolver** ao locatário (caução cobre débitos).  
- `saldoFinal < 0`: locatário **deve** `|saldoFinal|` além do que já foi retido.  
- `caucaoDevolver = caucao - retencaoCaucao` é só a parte da caução após retenção por quebra, **antes** de multas e atrasos.

## Limitações v1

- Não consulta Rastreame automaticamente — informar `semanasPagas` manualmente ou via JSON gerado pelo operador.
- Não gera PDF/Word de acerto; saída texto + JSON opcional.
- Última semana parcial: cobra parcela semanal inteira se o vencimento caiu antes do encerramento e não foi paga (sem pro-rata diário de locação além das diárias de atraso).
