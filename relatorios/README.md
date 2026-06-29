# Relatórios (repo Aworklanza)

Saídas geradas pela CLI em `src/run.ts`. **Prestação de contas para parceiros** (PDF/planilha mensal) continua no Dropbox (`Financeiro/prestação de contas/`).

Todos os relatórios são gravados sob **`_tmp/<tipo>/`** (uma subpasta por tipo de relatório). Essa pasta é **ignorada pelo git** (`.gitignore`): os relatórios ficam só locais e **não são comitados**.

| Pasta (`_tmp/...`) | Conteúdo |
|-------|----------|
| `_tmp/quebra-contrato/` | Acerto de encerramento — `quebra-contrato-*.txt` (documento para o cliente) |
| `_tmp/prestacao-contas/` | Relatórios internos do repo (ex. listagens semanais Rastreame) |
| `_tmp/cobrancas/` | Mensagens de cobrança WhatsApp — `cobranca-*.txt` |
| `_tmp/sync/` | Lotes DETRAN — `_sync_infracoes.json`, `_sync_ipva_licenciamento.json` |
| `_tmp/analise-cadastro/` | Análise de cadastro do locatário — `<cpf>-<data>.json|.txt` + `downloads/` |

Os caminhos são centralizados em `src/lib/relatoriosPaths.ts`.
