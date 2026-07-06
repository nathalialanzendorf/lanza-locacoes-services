# Relatório de cobranças

Siga a skill **relatorio-cobrancas**.

## Parâmetros (0 a 3 — omitir = **todos** nessa dimensão)

| Parâmetro | Omitir significa |
|---|---|
| **tipo-despesa** | todos os tipos |
| **cliente** | todos os clientes |
| **veículo** | todos os veículos |

Tipos-despesa: `pagamento-semanal` · `renegociacao` · `infracoes` · `pedagio` · `estacionamento-rotativo` · `manutencao`

Cliente e veículo são **mutuamente exclusivos**. Pode informar 1, 2, 3 ou **nenhum** parâmetro.

### Exemplos

```
/relatorio-cobrancas                                    → tudo
/relatorio-cobrancas pagamento-semanal                  → tipo + todos clientes/veículos
/relatorio-cobrancas infracoes Daniel Damasceno         → tipo + cliente
/relatorio-cobrancas pedagio RAH-4F54                    → tipo + veículo
/relatorio-cobrancas Daniel Damasceno                    → cliente + todos tipos
/relatorio-cobrancas RAH-4F54                            → veículo + todos tipos
```

## CLI

| Parâmetro | Flag |
|---|---|
| tipo-despesa | 1º arg ou `--tipo` |
| cliente | `--cliente "NOME"` |
| veículo | `--placa PLACA` |

```bash
npx tsx src/run.ts relatorio-cobrancas --listar
npx tsx src/run.ts relatorio-cobrancas pagamento-semanal --cliente "Daniel Damasceno"
npx tsx src/run.ts relatorio-cobrancas --placa RAH-4F54
```

## Fluxo

1. Interpretar parâmetros do utilizador (0–3).
2. `--listar` para conferir alvos; depois gerar.
3. **pagamento-semanal**: tabela semanal-atraso + WhatsApp (dia **automático**: D+1 lembrete · D+2 aviso · D+3 bloqueio; D0 sem mensagem).
4. **Fim do relatório (obrigatório)** — escopo cliente/placa:
   - Resumo semanal com juros por semana (se ATRASADO)
   - **Uma tabela semanal-atraso por semana** em aberto + total geral
   - **Mensagens WhatsApp separadas** — uma por tipo de cobrança + despesas em aberto
5. Criar **canvas** com `node scripts/gen-cobranca-canvas.mjs` a partir do JSON sidecar `cobranca-*.json` (layout em `templates/canvas/cobranca.layout.tsx`). O gerador grava em `canvases/` **e copia** para `~/.cursor/projects/d-Dropbox-Aworklanza/canvases/` (só o IDE abre daí).

Modo legado por placa: `semanal`, `semanal-atraso`, `estacionamento`, `multa` — exige `--placa`.
