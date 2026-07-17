# Lanza Web

Frontend React do painel operacional **Lanza Locações**. Consome a [Lanza API](https://github.com/nathalialanzendorf/lanza-locacoes) (`/api/docs`).

## Stack

- React 19 + TypeScript
- Vite 6
- React Router 7
- TanStack Query

## Arranque rápido

### 1. API (terminal 1)

Clone e suba a API em [lanza-locacoes](https://github.com/nathalialanzendorf/lanza-locacoes):

```bash
git clone https://github.com/nathalialanzendorf/lanza-locacoes.git
cd lanza-locacoes
npm install
npm run api:dev
```

A API fica em `http://127.0.0.1:3100` (documentação: `/api/docs`).

### 2. Frontend (terminal 2)

```bash
git clone https://github.com/nathalialanzendorf/lanza-web.git
cd lanza-web
npm install
npm run dev
```

Abra `http://localhost:5173`. Em desenvolvimento, o Vite faz **proxy** de `/api` e `/health` para a API local — não é preciso configurar CORS.

## Variáveis de ambiente

Copie `.env.example` para `.env` e ajuste conforme necessário:

| Variável | Uso |
|----------|-------|
| `VITE_API_BASE_URL` | URL absoluta da API em produção (ex.: deploy Vercel). Em dev, deixe vazio para usar o proxy. |
| `VITE_API_KEY` | Chave opcional (`X-API-Key`) quando `LANZA_API_KEY` está ativa no servidor. |
| `VITE_API_PROXY_TARGET` | Alvo do proxy Vite (default `http://127.0.0.1:3100`). |

A chave também pode ser guardada no navegador pelo banner de autenticação.

## Produção (Vercel) — 3 componentes

Ver **[DEPLOY.md](./DEPLOY.md)** para o mapa completo (frontend + API + PostgreSQL).

Resumo:

| Projeto Vercel | Repositório | URL |
|----------------|-------------|-----|
| `lanza-web` | [lanza-web](https://github.com/nathalialanzendorf/lanza-web) | https://lanzalocacoes.vercel.app |
| `lanza-locacoes` (API) | [lanza-locacoes](https://github.com/nathalialanzendorf/lanza-locacoes) | https://api.lanzalocacoes.vercel.app |

O frontend aponta para a API via `.env.production` (`VITE_API_BASE_URL`). A API aceita CORS do domínio do painel e reporta estado do PostgreSQL em `/health`.

## Páginas incluídas

| Rota | Endpoint |
|------|----------|
| `/` | `GET /api/resumo` — dashboard |
| `/clientes` | `GET /api/clientes` |
| `/veiculos` | `GET /api/veiculos` |
| `/contratos` | `GET /api/contratos` |
| `/despesas` | `GET /api/despesas` |
| `/locacoes` | `GET /api/locacoes` |

## Autenticação (login/senha)

O painel suporta contas de utilizador com JWT:

1. Defina `LANZA_JWT_SECRET` no servidor API (string aleatória longa).
2. Aceda a `/registro` para criar a **primeira conta** (bootstrap) ou defina `LANZA_ALLOW_REGISTER=true` para registo público.
3. Faça login em `/login` — o token fica em `localStorage` e é enviado como `Authorization: Bearer …`.

Rotas da API exigem JWT (ou `X-API-Key` legado) quando `LANZA_JWT_SECRET` ou `LANZA_API_KEY` estão activas.

A estrutura em `src/api/` está preparada para expandir com os demais grupos da OpenAPI (sync, relatórios, FIPE, etc.).
