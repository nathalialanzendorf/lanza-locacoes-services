# Arquitetura em produção — 3 componentes

```
┌─────────────────────────┐     HTTPS + CORS      ┌──────────────────────────────┐
│  Frontend (Vite/React)  │ ────────────────────► │  Backend API (@lanza/api)    │
│  lanzalocacoes.vercel   │   X-API-Key (opc.)    │  api.lanzalocacoes.vercel    │
└─────────────────────────┘                       └──────────────┬───────────────┘
                                                                 │ OIDC + IAM
                                                                 ▼
                                                    ┌──────────────────────────────┐
                                                    │  PostgreSQL (RDS AWS)        │
                                                    │  via LANZA_DB_BACKEND=postgres│
                                                    └──────────────────────────────┘
```

## URLs de produção

| Componente | URL |
|------------|-----|
| **Frontend** | https://lanzalocacoes.vercel.app |
| **API** | https://api.lanzalocacoes.vercel.app |
| **Docs** | https://api.lanzalocacoes.vercel.app/api/docs |

## Variáveis — projeto API (`lanza-locacoes`)

| Variável | Valor sugerido |
|----------|----------------|
| `LANZA_DB_BACKEND` | `dual` (grava JSON + PostgreSQL) ou `postgres` |
| `PGHOST` | host RDS (ex. `aws-postgres-lanza.cluster-….rds.amazonaws.com`) |
| `PGUSER` | `postgres` |
| `PGDATABASE` | `postgres` |
| `PGSSLMODE` | `require` |
| `AWS_REGION` | `sa-east-1` |
| `AWS_ROLE_ARN` | `arn:aws:iam::…:role/Vercel/access-postgres-lanza` |
| `LANZA_WEB_URL` | `https://lanzalocacoes.vercel.app` |
| `LANZA_API_PUBLIC_URL` | `https://api.lanzalocacoes.vercel.app` |
| `LANZA_API_CORS_ORIGIN` | *(opcional)* lista separada por vírgula; default já inclui o frontend |

## Variáveis — projeto Frontend (`lanza-web`)

| Variável | Valor |
|----------|-------|
| `VITE_API_BASE_URL` | `https://api.lanzalocacoes.vercel.app` |

Já definido em `.env.production` — o build Vercel usa automaticamente.

## Verificar ligação

```bash
# API + base de dados
curl https://api.lanzalocacoes.vercel.app/health

# Dados operacionais
curl https://api.lanzalocacoes.vercel.app/api/resumo
```

Resposta esperada de `/health`:

```json
{
  "status": "ok",
  "database": { "backend": "postgres", "postgres": { "ok": true } },
  "apiUrl": "https://api.lanzalocacoes.vercel.app",
  "frontendUrl": "https://lanzalocacoes.vercel.app"
}
```

O painel em https://lanzalocacoes.vercel.app mostra no rodapé a versão da API e o backend de dados (`file` ou `postgres`).

## Redeploy

Após alterar variáveis, faça **Redeploy** nos dois projetos Vercel (API e frontend).
