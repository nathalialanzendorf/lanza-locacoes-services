# Tool — Rastreame (rastreame.com.br)

Integração HTTP com [rastreame.com.br](https://rastreame.com.br/). Execução via CLI na **raiz do repo** (`npm install`).

Skills que **usam** esta tool: `cadastro-cliente`, `cadastro-recebimento`, `renegociar-debitos` (regras de negócio ficam nas skills).

## Autenticação (`.env`)

| Variável | Uso |
|----------|-----|
| `RASTREAME_AUTH` | JWT → header `x-r2f-auth` (prioridade). Renovar via DevTools → Network. |
| `RASTREAME_LOGIN` + `RASTREAME_SENHA` | Login automático alternativo. |
| `RASTREAME_TLS_INSECURE=1` | Só diagnóstico se `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. |

Ficheiro `.env` na raiz do repo (não versionado; ver `.env.example`). A CLI carrega-o quando `auth.ts` é importado — útil se o terminal do agente não herdar variáveis do Cursor.

**Nunca** versionar tokens no Git.

## Módulos (`src/lib/rastreame/`)

| Módulo | Função |
|--------|--------|
| `auth.ts` | Token, headers |
| `motorista.ts` | `/keek/rest/motorista` |
| `gasto.ts` | `/keek/rest/gasto` |
| `rastreavel.ts` | `/keek/rest/rastreavel` |
| `renegociacao.ts` | Marcação `[NEGOCIADO X]` |

## Comandos CLI

```bash
npx tsx src/run.ts rastreame check "<cnh>" ["nome"]
npx tsx src/run.ts rastreame add "<cliente.json>"
npx tsx src/run.ts importar-clientes-rastreame [--dry-run]

npx tsx src/run.ts rastreame-gastos list [--page 0] [--size 50]
npx tsx src/run.ts rastreame-gastos post "<corpo.json>"
npx tsx src/run.ts rastreame-gastos put <id> "<corpo.json>"

npx tsx src/run.ts rastreame-lancar-semanal [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--execute]

npx tsx src/run.ts renegociar-debitos resumo --motorista <key> --rastreavel <key>
npx tsx src/run.ts renegociar-debitos "<entrada.json>" [--execute]
```

## Mapa skill → comando

| Skill | Objetivo | Comando |
|-------|----------|---------|
| cadastro-cliente | Verificar motorista | `rastreame check` |
| cadastro-cliente | Criar motorista | `rastreame add` |
| cadastro-recebimento | Listar / criar / editar gasto | `rastreame-gastos list\|post\|put` |
| importar clientes | Rastreame → `clientes.json` | `importar-clientes-rastreame` |
| lançamento semanal | Contratos ativos → gasto OUTROS | `rastreame-lancar-semanal` |
| renegociar-debitos | Resumo e execução | `renegociar-debitos` |

## Erros comuns

- **401/403:** token expirado → renovar `RASTREAME_AUTH`.
- **404 em list:** ajustar URL em `gasto.ts` conforme XHR na [listagem de gastos](https://rastreame.com.br/#/gastos/list).
- **Antes de POST gasto:** verificar duplicado por `info` (skill cadastro-recebimento).

## Extensão

Novo endpoint: função em `src/lib/rastreame/`, subcomando em `run.ts`, linha nesta tabela.
