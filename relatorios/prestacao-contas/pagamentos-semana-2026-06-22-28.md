# Pagamentos semanais Rastreame — 22/06 a 28/06/2026

**Título (`info`) sugerido** para lançamentos em atraso nesta rotina: `ATRASADO - Pagamento semanal - Segunda 22`  
(22/06/2026 é **segunda-feira**; horário local **23:59** — em ISO costuma espelhar o padrão que o site já usa; conferir com um gasto de teste na UI.)

## Critérios usados (automático, heurístico)

- Pastas sob `contratosDir` (`D:/Dropbox/Aluguel Carros`) com ficheiro `Contrato*.docx`.
- **Excluídos** caminhos com: `devolvido`, `Encerrado`, `entregue`, `recolhido`, `Modelo v3`, `compra e venda`, `Copy`, orçamentos.
- **Contrato “ativo” na semana 22–28/06/2026:** data no nome da pasta `DD.MM.YYYY` (ou `DD.MM.YY`) interpretada como **início**; fim estimado = início + **90 dias** (prazo típico; **ajustar** se o contrato tiver outra duração). Mantém-se se o intervalo \[início, fim\] intersecta \[22/06/2026, 28/06/2026\].
- **Uma linha por pasta de contrato** (vários `.docx` na mesma pasta → um único lançamento semanal).

> **Valores (R$):** não foram lidos automaticamente dos Word neste relatório. Confirmar **valor semanal** na cláusula de valores de cada contrato antes do `post`.

## Contratos candidatos (15 pastas)

| # | Início (pasta) | Locatário (pasta) | Pasta veículo | Notas |
|---|----------------|-------------------|---------------|--------|
| 1 | 24.03.2026 | Arlem Eduardo Pereira Rodriguez | Luiz - RENAULT SANDERO 2015-2015 | `(troca 29.05.26)` |
| 2 | 24.03.2026 | Tiago Augusto da Silva Piareti | Luiz - RENAULT SANDERO 2017-2017 | Ano `26` na pasta |
| 3 | 01.04.2026 | Vitor Hugo Pacifico Machado | Maicon - VW GOL 2012-2013 | `(recuperado 02.04)` |
| 4 | 20.04.2026 | Reinier Figueroa Yera | Maicon - VW GOL 2017-2018 | |
| 5 | 05.05.2026 | Susana da Silva | Felipe - RENAULT SANDERO 2013-2014 | `(troca 09.05.26)` |
| 6 | 05.05.2026 | Susana da Silva | Maicon - VW GOL 2017-2018 | Segundo veículo; **dois gastos** no Rastreame se dois rastreáveis |
| 7 | 12.05.2026 | Virginia Jose Caraballo Camacho | Felipe - RENAULT SANDERO 2013-2014 | |
| 8 | 15.05.2026 | Jennifer da Silva Boeira Rodriguez | Regiane - HYUNDAI HB20 2012-2013 | |
| 9 | 22.05.2026 | Laryssa (Gustavo) Costa de Quadros | Baiano - PEUGEOT 2008 2018-2019 | |
| 10 | 24.05.2026 | Ronald Viana Junior | Maicon - VW GOL 2012-2013 | `(trocado)` |
| 11 | 29.05.2026 | Arlem Eduardo Pereira Rodriguez | Felipe - VW FOX 2018-2018 | Dois `.docx`; uma pasta |
| 12 | 29.05.2026 | Daniel Damasceno | Luiz - FIAT MOBI 2019-2020 | |
| 13 | 29.05.2026 | Juliano Foizer Silveira | Luiz - RENAULT SANDERO 2015-2015 | |
| 14 | 04.06.2026 | Vitor Bassani Padilha | Luiz - HYUNDAI HB20 2013-2014 | Dois `.docx`; uma pasta |
| 15 | 20.06.2026 | Ceres Beatriz Gonzaga Pereira | Baiano - PEUGEOT 2008 2020-2021 | |

## O que falta para “realizar” no Rastreame

1. **`RASTREAME_AUTH`** (ou login) definido no ambiente — ver `.cursor/tools/rastreame/`.
2. Para **cada linha**: `motorista.key` e `rastreavel.key` no Rastreame (UI ou API); **valor** semanal do contrato.
3. **Duplicados:** `npx tsx src/run.ts rastreame-gastos list` e filtrar por `info` igual a `ATRASADO - Pagamento semanal - Segunda 22` + mesmo par motorista/rastreável — **não** voltar a fazer `post` se já existir.
4. Corpo JSON mínimo (exemplo):

```json
{
  "total": 0,
  "info": "ATRASADO - Pagamento semanal - Segunda 22",
  "tipo": { "key": "OUTROS" },
  "rastreavel": { "key": "FALTA" },
  "motorista": { "key": "FALTA" },
  "data": "2026-06-23T02:59:00.000Z"
}
```

5. `npx tsx src/run.ts rastreame-gastos post "relatorios/_tmp/_gasto_um.json"` — repetir por contrato após preencher `total` e keys.

## Placa / `database` (apoio)

Cruzar a pasta do veículo com `database/veiculos.json` (`marcaModelo` / `placa`) para identificar o rastreável certo no Rastreame.

---

*Gerado por critério de datas + 90 dias; validar duração real de cada contrato e valores antes de lançar.*
