# Relatório de encerramento de contrato

Siga a skill **relatorio-encerramento-contrato**.

Calcula o acerto (multas, parcelas, pedágios, retenção de caução, saldo) e grava **TXT para WhatsApp** + **JSON** (canvas).

## Uso

```
/relatorios/encerramento-contrato susana
/relatorios/encerramento-contrato "05.05.2026 - Nome" 26/06/2026
```

## Parâmetros

| Parâmetro | Significado |
|---|---|
| **cliente** ou **pasta** | Nome do locatário (busca pasta) ou caminho `DD.MM.AAAA - Nome` |
| **data** (opcional) | Encerramento `DD/MM/AAAA` — se omitida, usar a do `contratos.json` ou perguntar |

## Saída

Gravado em `relatorios/_tmp/encerramento-contrato/`:

- `encerramento-contrato-{placa}-{cliente}-{DD-MM-AAAA}.txt` — **colar no WhatsApp** (sem avisos internos)
- `encerramento-contrato-{placa}-{cliente}-{DD-MM-AAAA}.json` — dados para o canvas

## Fluxo

1. Localizar pasta do contrato vigente (`contratos.json` + Dropbox).
2. Rodar CLI com JSON de entrada (`fonteDebitos: abertos-db`, `incluirInfracoesCliente: true`) quando houver débitos no Rastreame.
3. Validar totais com o operador.
4. **Sempre** criar canvas com `node scripts/gen-encerramento-canvas.mjs` a partir do JSON sidecar (layout em `templates/canvas/encerramento.layout.tsx`).
5. Enviar o `.txt` ao locatário; avisos do terminal **não** vão no WhatsApp.

```bash
npx tsx src/run.ts relatorio-encerramento-contrato relatorios/_tmp/encerramento-susana-gol.json
npx tsx src/run.ts relatorio-encerramento-contrato "D:/Dropbox/Aluguel Carros/.../05.05.2026 - Nome" --encerramento 26/06/2026
```

Efetivar encerramento no database: skill **cadastro-contrato** (`encerrar`).
