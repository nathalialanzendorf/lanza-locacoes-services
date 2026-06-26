---
name: rastreame-site
description: >-
  Specialist for rastreame.com.br: runs CLI commands (motorista, gastos),
  auth env vars, and HTTP patterns for other skills. Use when any workflow
  needs Rastreame API execution, token, rastreame check/add, rastreame-gastos
  list/post/put, renegociar-debitos, or when cadastrar-cliente /
  cadastrar-recebimento / renegociar-debitos delegate site actions here.
---

# Rastreame — site (especialista)

Skill **especialista** no site [rastreame.com.br](https://rastreame.com.br/): o agente **lê esta skill** sempre que precise **executar** integrações no site (terminal na **raiz do repo**), em vez de improvisar `curl`/headers.

As **regras de negócio** (o *quê* e *quando* cadastrar) ficam nas skills de domínio (**cadastrar-cliente**, **cadastrar-recebimento**, …); esta skill concentra **auth**, **libs TypeScript**, **comandos CLI** e **erros comuns**.

## Quando usar

- O utilizador ou outra skill pede ação no **Rastreame** (motorista, gastos, token).
- A skill **cadastrar-cliente** chegou ao passo opcional **Rastreame** após `merge-cliente`.
- A skill **cadastrar-recebimento** precisa de `list` / `post` / `put` em gastos.
- A skill **renegociar-debitos** precisa de `resumo`, dry-run e `--execute` em gastos.
- Qualquer skill futura que diga “delegar execução ao site Rastreame”.

## Autenticação — variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `RASTREAME_AUTH` | Token JWT para o header `x-r2f-auth` (prioridade). Expira; renovar via DevTools → Network. |
| `RASTREAME_LOGIN` + `RASTREAME_SENHA` | Alternativa: login automático para obter token. |

**Ficheiro `.env`:** na raiz do repo, podes definir as mesmas variáveis num ficheiro `.env` (não versionado; ver `.env.example`). A CLI carrega-o automaticamente quando `auth.ts` é importado — útil se o terminal do agente **não** herdar variáveis definidas só nas definições do Cursor.

Se o Node acusar **`UNABLE_TO_VERIFY_LEAF_SIGNATURE`** ao falar com `rastreame.com.br`, trata da CA corporativa ou, só para diagnóstico, `RASTREAME_TLS_INSECURE=1` no `.env` (ver `.env.example`).

**Nunca** versionar tokens, cookies nem `curl` com sessão no Git.

## Código reutilizável (`src/lib/rastreame/`)

| Módulo | Responsabilidade |
|--------|------------------|
| `auth.ts` | `RASTREAME_ORIGIN`, `fetchRastreameToken()`, `requireRastreameToken()`, `rastreameJsonHeaders()`, cache de token. |
| `motorista.ts` | `listMotoristas()`, `findMotorista()`, `postMotorista()` — API `/keek/rest/motorista`. |
| `gasto.ts` | `fetchGastosList()`, `fetchGastoById()`, `fetchAllGastos()`, `postGasto()`, `putGasto()` — API `/keek/rest/gasto`. |
| `renegociacao.ts` | Marcação `[NEGOCIADO X]`, parcelas DOCUMENTACAO — usado por `renegociar-debitos`. |
| `rastreavel.ts` | `listRastreaveis()` — API `/keek/rest/rastreavel` (usado pelo lançamento semanal). |

Novas integrações Rastreame devem **reutilizar `auth.ts`** para headers e token.

## Base de dados local (sem Rastreame)

Comandos que só alteram `database/*.json` (ex.: `merge-cliente`, `gravar-despesa`, `merge-veiculo`) **não** chamam o site. As skills de domínio compõem: primeiro JSON local, depois opcionalmente os comandos desta skill.

## Mapa: outra skill → comandos a correr

| Origem | Objetivo no site | Comandos (raiz do repo, após `npm install`) |
|--------|------------------|-----------------------------------------------|
| **cadastrar-cliente** (após merge local) | Saber se o motorista já existe | `npx tsx src/run.ts rastreame check "<cnh>" "Nome Completo"` |
| **cadastrar-cliente** | Criar motorista a partir do JSON já gravado | `npx tsx src/run.ts rastreame add "caminho/cliente.json"` (ficheiro com o mesmo schema que o merge aceita) |
| **cadastrar-recebimento** | Listar gastos (duplicados, auditoria) | `npx tsx src/run.ts rastreame-gastos list [--page 0] [--size 50]` |
| **cadastrar-recebimento** | Criar gasto | Montar JSON conforme `cadastrar-recebimento/reference.md` → `npx tsx src/run.ts rastreame-gastos post "relatorios/_gasto.json"` |
| **cadastrar-recebimento** | Atualizar gasto | Corpo completo típico de `PUT` (espelhar UI) → `npx tsx src/run.ts rastreame-gastos put <id> "relatorios/_gasto_put.json"` |
| **Lançamento em lote (semanal)** | Contratos ativos na semana → gasto OUTROS sem duplicar | `npx tsx src/run.ts rastreame-lancar-semanal [--inicio YYYY-MM-DD] [--fim YYYY-MM-DD] [--prazo-dias 90]` (dry-run); depois `--execute`. Sem `--info`/`--data-iso`, deriva a segunda da semana do `--inicio`. |
| **renegociar-debitos** | Listar débitos em aberto | `npx tsx src/run.ts renegociar-debitos resumo --motorista <key> --rastreavel <key>` |
| **renegociar-debitos** | Marcar `[NEGOCIADO X]` + parcelas DOCUMENTACAO | Montar JSON conforme `renegociar-debitos/reference.md` → dry-run → `npx tsx src/run.ts renegociar-debitos "<json>" [--execute]` |

Sempre **confirmar `cwd`** = raiz do repositório antes de `npx tsx`.

## Resumo CLI (copiar da raiz do repo)

```bash
npx tsx src/run.ts rastreame check "<cnh>" ["nome"]
npx tsx src/run.ts rastreame add "<cliente.json>"

npx tsx src/run.ts rastreame-gastos list [--page 0] [--size 50]
npx tsx src/run.ts rastreame-gastos post "<corpo.json>"
npx tsx src/run.ts rastreame-gastos put <id> "<corpo.json>"

npx tsx src/run.ts rastreame-lancar-semanal [--inicio 2026-06-29] [--fim 2026-07-05] [--prazo-dias 90] [--info "..."] [--data-iso ...] [--execute]

npx tsx src/run.ts renegociar-debitos resumo --motorista <key> --rastreavel <key>
npx tsx src/run.ts renegociar-debitos "<entrada.json>" [--execute]
```

## Motorista — detalhe

- Saída `JA CADASTRADO` / `NAO CADASTRADO` / mensagem de cadastro: interpretar e reportar à skill “pai”.
- HTTP 401/403: token expirado — renovar `RASTREAME_AUTH` (DevTools → `x-r2f-auth`).

## Gastos — detalhe

- **Antes de `post`:** a skill **cadastrar-recebimento** obriga a verificar duplicado por `info` + motorista + rastreável; usar `list` ou UI.
- **404 em `list`:** ajustar URL em `src/lib/rastreame/gasto.ts` conforme XHR real na [listagem de gastos](https://rastreame.com.br/#/gastos/list).

## Fluxo do agente (checklist)

1. Garantir `RASTREAME_AUTH` ou `RASTREAME_LOGIN`+`RASTREAME_SENHA` (secção **Autenticação** acima).
2. Escolher comando conforme tabela **Mapa**.
3. Correr na shell; capturar stdout/stderr.
4. Se falhar, repetir com token novo ou reportar erro HTTP à skill de negócio.

## Extensão

Novos endpoints Rastreame: acrescentar funções em `src/lib/rastreame/`, expor subcomando em `src/run.ts`, e **uma linha** na tabela **Mapa** + secções relevantes **nesta skill**.
