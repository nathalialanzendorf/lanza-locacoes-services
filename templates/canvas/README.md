# Layouts de canvas — encerramento e cobrança

Dois layouts **independentes** para relatórios Lanza. Cada um vive no seu ficheiro; alterações num **não** propagam ao outro.

| Layout | Ficheiro | Relatório |
|---|---|---|
| Encerramento | `encerramento.layout.tsx` | Acerto final de contrato (caução, créditos, quebra) |
| Cobrança | `cobranca.layout.tsx` | Débitos em aberto + WhatsApp (por contrato) |
| Cobrança (filtro) | `cobranca-simples.layout.tsx` | Tipo ou placa: tabelas agrupadas |

## Modos do canvas de cobrança

| Invocação | Layout | Agrupamento |
|---|---|---|
| Sem parâmetros | `cobranca` | Um canvas por contrato ativo |
| `--cliente` | `cobranca` | Um canvas do locatário |
| **Só tipo** (ex. `pedagio`) | `cobranca-simples` | **Por veículo** (placa + modelo) |
| **Só `--placa`** | `cobranca-simples` | **Por tipo de despesa** |

Sidecar simples: `cobranca-simples-{tipo|placa}-{DD-MM-AAAA}.json` → `canvases/cobranca-simples-….canvas.tsx`

## Origem

O layout de **cobrança** foi **copiado** do de **encerramento** (mesma estrutura de tabelas, cartão, stats, divisor). Depois da cópia, evoluem em paralelo.

## Gerar canvas a partir do sidecar JSON

```bash
node scripts/gen-encerramento-canvas.mjs relatorios/_tmp/encerramento-contrato/encerramento-….json canvases/encerramento-….canvas.tsx

node scripts/gen-cobranca-canvas.mjs relatorios/_tmp/cobrancas/cobranca-….json canvases/cobranca-….canvas.tsx
```

O gerador de cobrança grava em `canvases/` **e copia** automaticamente para `~/.cursor/projects/d-Dropbox-Aworklanza/canvases/` (só o Cursor IDE abre daí).

Os geradores só **injetam dados** (`__DADOS__`, `__COMPONENT_NAME__`) no layout correspondente. Para mudar o visual, edite o `.layout.tsx` certo — nunca o sidecar JSON nem o gerador, salvo novos campos.

## Placeholders (não editar manualmente nos `.layout.tsx` gerados)

- `__DADOS__` — objeto JSON embutido
- `__COMPONENT_NAME__` — nome do componente React exportado
