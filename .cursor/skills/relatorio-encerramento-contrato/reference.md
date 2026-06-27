# Encerramento de contrato — referência

## Extração do contrato (`.docx`)

O CLI lê **apenas o `Contrato*.docx` mais recente** na pasta (maior sufixo `vN` ou data de modificação):

| Campo | Origem |
|-------|--------|
| Cliente | Nome após `DD.MM.AAAA -` na pasta |
| Placa | Cláusula 1.1 (`placa: …`) |
| CPF | Bloco LOCATÁRIO |
| Prazo (dias) | Cláusula 1.2 (`lapso temporal de validade de N dias`) |
| Início / fim | Cláusula 1.2 do **documento mais recente** (obrigatório se houver v2+ na pasta) |
| Valor semanal | Regex em `docxPlain.ts` |
| Caução | Texto próximo a “caução” ou fallback |
| Diária | `semana / 7` |

**Renovações:** versões anteriores do Word (`v1`, `v2`, …) ou pastas antigas (`contratos.json` → `versao` menor) **não entram** no relatório de quebra. Só o contrato vigente (último docx / maior `versao` no database).

Se existirem vários `.docx` na pasta, o período início/fim **tem** de estar explícito no mais recente; senão o CLI recusa gerar o relatório (evita usar a data da pasta do contrato original).

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
- Saída gravada em `relatorios/quebra-contrato/quebra-contrato-*.txt` (documento para o cliente; use `--no-salvar` para só terminal).
- Última semana parcial: cobra parcela semanal inteira se o vencimento caiu antes do encerramento e não foi paga (sem pro-rata diário de locação além das diárias de atraso).
