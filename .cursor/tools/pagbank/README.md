# Tool — PagBank (minhaconta.pagbank.com.br)

Integração HTTP com o extrato de **créditos** da conta PagBank. Execução via CLI na **raiz do repo** (`npm install`).

Skill que **usa** esta tool: **`cadastro-recebimento`** (modo lote — cruzar PIX/recebimentos com despesas de cliente em aberto).

## Autenticação (variáveis de ambiente do utilizador)

**Não** grave credenciais em `.env`. Defina no Windows (utilizador) ou no perfil do shell:

| Variável | Uso |
|----------|-----|
| `PAGBANK_AUTH` | Valor do header `authorization` capturado no DevTools → Network ao abrir o extrato em [minhaconta.pagbank.com.br](https://minhaconta.pagbank.com.br/). |
| `PAGBANK_COOKIE` | (Opcional) Cookie completo da sessão, se a API exigir além do token. |
| `PAGBANK_USER_AGENT` | (Opcional) Override do User-Agent. |

```powershell
[Environment]::SetEnvironmentVariable("PAGBANK_AUTH", "<token>", "User")
# ou
.\scripts\set-pagbank-auth-user-env.ps1 -Token "<token>"
```

**Como capturar o token**

1. Abrir [minhaconta.pagbank.com.br](https://minhaconta.pagbank.com.br/) e ir ao **extrato**.
2. DevTools → **Network** → filtrar `statements/list`.
3. Copiar o header **`authorization`** do pedido (valor longo, sem prefixo `Bearer` se o site não usar).
4. Se a API falhar só com o token, copiar também o header **`Cookie`** → `PAGBANK_COOKIE`.

Renovar quando `pagbank check` ou a listagem devolver HTTP 401/403.

**Nunca** versionar tokens no Git.

## API

| Ação | Método | URL |
|------|--------|-----|
| Listar extrato (créditos) | `GET` | `https://api.ibanking.pagbank.com.br/checkingaccount/statements/list?operationSign=C&initialDate=…&finalDate=…&page=…` |

Query params:

| Param | Valor |
|-------|--------|
| `operationSign` | `C` (créditos) |
| `initialDate` / `finalDate` | `YYYY-MM-DD` |
| `page` | número da página (1-based) |

Headers mínimos (como no site): `authorization`, `Origin`, `Referer`, `x-bank-statement-v2-flow: true`, `x-requested-with: XMLHttpRequest`.

## Módulos (`src/lib/pagbank/`)

| Módulo | Função |
|--------|--------|
| `auth.ts` | Token, headers, `check` |
| `statements.ts` | GET extrato, normalização de créditos |
| `matchLote.ts` | Cruzamento crédito → cliente → plano de baixa |

Plano de baixa (regras de negócio): `src/lib/recebimento/baixaPlano.ts` — skill **`cadastro-recebimento`**.

## Comandos CLI

```powershell
# Verificar sessão
npx tsx src/run.ts pagbank check

# Listar créditos (últimos 30 dias por defeito)
npx tsx src/run.ts pagbank creditos list [--inicio 2026-05-31] [--fim 2026-06-29] [--json]

# Uma página específica (+ JSON bruto da API)
npx tsx src/run.ts pagbank creditos list --inicio 2026-06-01 --fim 2026-06-29 --page 1 --json

# Cruzar com clientes/despesas → planos de baixa (pré-visualização)
npx tsx src/run.ts pagbank match [--inicio 2026-05-31] [--fim 2026-06-29] [--json]
```

Alias legado (mesmo que `pagbank match`):

```powershell
npx tsx src/run.ts baixa-recebimento pagbank [--inicio …] [--fim …] [--json]
```

Baixa **unitária** (sem PagBank — só cliente + valor + data):

```powershell
npx tsx src/run.ts baixa-recebimento plano --cliente Virginia --valor 650 --data 18/06/2026 --hora 06:10 --json
```

## Cruzamento (`pagbank match`)

Para cada **crédito** no extrato:

1. Identificar **cliente** pelo nome na descrição / pagador PIX vs `clientes.json` (ativos).
2. Localizar **despesa em aberto** mais antiga do motorista (`ATRASADO` semanal).
3. Montar **plano de baixa** (integral, parcial ou integral com desconto).
4. Incluir **próxima parcela** em aberto na pré-visualização.

Saída JSON:

- **`planos[]`** — match com confiança `alta` | `media` | `baixa` + `plano.linhas[]` para confirmação.
- **`semMatch[]`** — créditos sem cliente/despesa identificados (tratar no modo unitário).

> A skill **`cadastro-recebimento`** exige **confirmação Sim/Não por linha** antes de gravar. A tool PagBank **só planeja** — não grava em `cliente-despesas.json` nem no Rastreame.

## Fluxo com a skill `cadastro-recebimento`

1. Operador: `/cadastro-recebimento` (sem parâmetros) ou “baixar do PagBank”.
2. Agente: `pagbank match --json` (verificar `PAGBANK_AUTH` antes).
3. Tabela + Sim/Não por linha de cada plano.
4. Gravar confirmados: `gravar-cliente-despesa editar` + push Rastreame (tool **Rastreame**).
