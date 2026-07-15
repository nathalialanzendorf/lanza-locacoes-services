# Lanza Web

Frontend React para a **Lanza API** (`@lanza/api` no repositório [Aworklanza](../README.md)).

Repositório **separado** dentro do mesmo workspace Dropbox — não faz parte do monorepo `packages/*`, mas consome os endpoints documentados em `/api/docs`.

## Stack

- React 19 + TypeScript
- Vite 6
- React Router 7
- TanStack Query

## Arranque rápido

### 1. API (terminal 1)

Na raiz do **Aworklanza**:

```bash
npm run api:dev
```

A API fica em `http://127.0.0.1:3100` (documentação: `/api/docs`).

### 2. Frontend (terminal 2)

```bash
cd lanza-web
npm install
npm run dev
```

Abra `http://localhost:5173`. Em desenvolvimento, o Vite faz **proxy** de `/api` e `/health` para a API local — não é preciso configurar CORS.

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste conforme necessário:

| Variável | Uso |
|----------|-----|
| `VITE_API_BASE_URL` | URL absoluta da API em produção (ex.: deploy Vercel). Em dev, deixe vazio para usar o proxy. |
| `VITE_API_KEY` | Chave opcional (`X-API-Key`) quando `LANZA_API_KEY` está ativa no servidor. |
| `VITE_API_PROXY_TARGET` | Alvo do proxy Vite (default `http://127.0.0.1:3100`). |

A chave também pode ser guardada no navegador pelo banner de autenticação.

Se aparecer `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ao instalar dependências, é o mesmo problema de certificado TLS descrito no README do Aworklanza. Pode criar um `.npmrc` local com `strict-ssl=false` (apenas neste ambiente) ou corrigir a cadeia de certificados no sistema.

## Produção (Vercel)

### Opção A — segundo projeto no mesmo repositório GitHub

1. No [dashboard Vercel](https://vercel.com/new), importe `nathalialanzendorf/lanza-locacoes`.
2. **Root Directory:** `lanza-web`
3. **Framework Preset:** Vite (detectado automaticamente)
4. Variáveis de ambiente (Settings → Environment Variables):

| Nome | Valor |
|------|-------|
| `VITE_API_BASE_URL` | `https://lanza-locacoes.vercel.app` (ou URL de produção da API) |
| `VITE_API_KEY` | (opcional) mesma chave de `LANZA_API_KEY` na API |

5. Deploy.

Na API (`lanza-locacoes`), defina `LANZA_API_CORS_ORIGIN` com o domínio do frontend (ex.: `https://lanza-web.vercel.app`).

### Opção B — CLI

```bash
cd lanza-web
npx vercel login
npx vercel --prod
```

Defina `VITE_API_BASE_URL` quando o CLI pedir variáveis de ambiente.

## Páginas incluídas

| Rota | Endpoint |
|------|----------|
| `/` | `GET /api/resumo` — dashboard |
| `/clientes` | `GET /api/clientes` |
| `/veiculos` | `GET /api/veiculos` |
| `/contratos` | `GET /api/contratos` |
| `/despesas` | `GET /api/despesas` |
| `/locacoes` | `GET /api/locacoes` |

A estrutura em `src/api/` está preparada para expandir com os demais grupos da OpenAPI (sync, relatórios, FIPE, etc.).

Este diretório pode ficar no mesmo repositório GitHub (`lanza-locacoes`) com um **segundo projeto Vercel** apontando para `lanza-web/` como root directory.
