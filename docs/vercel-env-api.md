# Variáveis de ambiente — projeto API na Vercel

| Componente | Projeto Vercel | GitHub | URL pública |
|------------|----------------|--------|-------------|
| **API** | `lanza-locacoes-services` | `nathalialanzendorf/lanza-locacoes-services` | https://api.lanzalocacoes.vercel.app |
| **Frontend** | `lanza-locacoes-app` | `nathalialanzendorf/lanza-locacoes-app` | https://lanzalocacoes.vercel.app |

> **Domínios:** confirme no dashboard que cada URL está no projeto certo (Settings → Domains).

## Setup do zero (projectos apagados / novo team)

São **dois** projectos Vercel (dois repositórios GitHub). Um único projecto não serve para API + frontend.

### 1. Projecto API

1. Vercel → **Add New Project** → importar **`nathalialanzendorf/lanza-locacoes-services`**
2. Framework: **Other** (usa `vercel.json`; `outputDirectory`: **`public`** — pasta vazia + `index.html`)
3. **Output Directory:** **`public`** (deve coincidir com `vercel.json`; não usar `dist`)
4. **Antes do 1.º deploy:** Settings → **Deployment Protection** → **Vercel Authentication = Disabled** (Production e Preview)
4. Deploy
5. Settings → **Domains** → adicionar **`api.lanzalocacoes.vercel.app`**
6. Settings → **Environment Variables** — tabela abaixo (ou `.\scripts\set-vercel-postgres-env.ps1` após `npx vercel link`)
7. **Redeploy** após gravar variáveis

### 2. Projecto Frontend

1. **Add New Project** → importar **`nathalialanzendorf/lanza-locacoes-app`**
2. Framework: **Vite** (detectado; `outputDirectory`: `dist`)
3. **Deployment Protection → Disabled**
4. Deploy
5. Domains → **`lanzalocacoes.vercel.app`**
6. Variável (opcional se `.env.production` no repo): `VITE_API_BASE_URL=https://api.lanzalocacoes.vercel.app`

### 3. Verificar

```powershell
curl.exe --ssl-no-revoke https://api.lanzalocacoes.vercel.app/health
curl.exe --ssl-no-revoke https://lanzalocacoes.vercel.app/
```

`/health` deve devolver JSON `{"status":"ok",...}` em &lt; 2s.

### CLI (opcional)

```powershell
# API
cd D:\Dropbox\Aworklanza\lanza-locacoes-services
npx vercel login
npx vercel link
.\scripts\set-vercel-postgres-env.ps1 -Backend postgres
.\scripts\fix-vercel-deploy-public.ps1 -ProjectName SEU-NOME-PROJECTO-API
```

---

Copie no dashboard Vercel → **Settings → Environment Variables** (Production, Preview e Development).

## PostgreSQL / RDS (valores reais)

| Variável | Valor |
|----------|-------|
| `LANZA_DB_BACKEND` | `postgres` *(só Postgres — produção)* ou `dual` *(JSON + Postgres)* |
| `PGHOST` | `aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com` |
| `PGPORT` | `5432` |
| `PGDATABASE` | `postgres` |
| `PGUSER` | `postgres` |
| `PGSSLMODE` | `require` |
| `AWS_REGION` | `us-east-1` |
| `AWS_ACCOUNT_ID` | `154601375525` |
| `AWS_RESOURCE_ARN` | `arn:aws:rds:us-east-1:154601375525:cluster:aws-pg-lanza-locacoes` |
| `AWS_RESOURCE_TYPE` | `rds` |
| `AWS_ROLE_ARN` | `arn:aws:iam::154601375525:role/Vercel/access-pg-lanza-locacoes` |

> **Nota:** o cluster RDS está em **us-east-1** (não sa-east-1).

## Autenticação

| Ambiente | Método |
|----------|--------|
| **Vercel (produção)** | OIDC + `AWS_ROLE_ARN` (token IAM automático) |
| **CLI local — opção A** | AWS CLI + token IAM (`rds-db:connect`) |
| **CLI local — opção B** | `PGPASSWORD` — senha estática do utilizador `postgres` |

A role `AWS_ROLE_ARN` (Vercel OIDC) **não é assumível** na máquina local. Use credenciais AWS **directas** (perfil/CLI) com permissão `rds-db:connect`.

### Opção A — AWS CLI + token IAM (sem senha RDS)

**Bash (Linux/macOS):**

```bash
export RDSHOST="aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com"
psql "host=$RDSHOST port=5432 dbname=postgres user=postgres sslmode=require \
  password=$(aws rds generate-db-auth-token --hostname $RDSHOST --port 5432 --username postgres --region us-east-1)"
```

**PowerShell (Windows):**

```powershell
.\scripts\set-postgres-user-env.ps1 -UseIam   # remove PGPASSWORD; mantém PGHOST/AWS_REGION
aws configure                               # ou aws sso login
.\scripts\postgres-psql.ps1                 # psql interactivo
npm run lanza -- postgres check             # mesmo token via @aws-sdk/rds-signer
npm run lanza -- postgres sync-all
```

### Opção B — senha estática

```powershell
.\scripts\set-postgres-user-env.ps1 -PromptPassword
npm run lanza -- postgres check
npm run lanza -- postgres sync-all
```

## URLs da aplicação

| Variável | Valor |
|----------|-------|
| `LANZA_WEB_URL` | `https://lanzalocacoes.vercel.app` |
| `LANZA_API_PUBLIC_URL` | `https://api.lanzalocacoes.vercel.app` |

## Aplicar via CLI

```powershell
npx vercel login
cd D:\Dropbox\Aworklanza
npx vercel link   # projeto lanza-locacoes-services
.\scripts\set-vercel-postgres-env.ps1
```

Depois: **Redeploy** do projeto API.

## Verificar

```bash
curl https://api.lanzalocacoes.vercel.app/health
```

Com `LANZA_DB_BACKEND=postgres`:

```json
{
  "status": "ok",
  "database": {
    "backend": "postgres",
    "postgres": { "ok": true }
  }
}
```

Com `LANZA_DB_BACKEND=dual`:

```json
{
  "status": "ok",
  "database": {
    "backend": "dual",
    "postgres": { "ok": true }
  }
}
```

## HTTP 500 em produção

Se `https://api.lanzalocacoes.vercel.app/health` devolve **500** (e o frontend mostra "Falha na ligação à API"):

1. **Dashboard Vercel** → projeto **API** → Settings → Environment Variables  
   Confirme: `PGHOST`, `AWS_ROLE_ARN`, `AWS_REGION`, `LANZA_DB_BACKEND` (e restantes da tabela acima).

2. **Integração AWS na Vercel** (OIDC → RDS): o projeto precisa de permissão para assumir `AWS_ROLE_ARN` e ligar ao cluster RDS.

3. **Redeploy** após alterar variáveis (Deployments → ⋮ → Redeploy).

4. **Contorno rápido** (sem RDS): defina `LANZA_DB_BACKEND=file` — a API usa os JSON em `database/` (só leitura na Vercel; adequado para dashboard/consulta).

5. **Com Postgres OK mas vazio**: `POST /api/admin/migrar` (com `X-Migrate-Secret` ou bootstrap) importa `database/*.json`.

6. **Login**: defina `LANZA_JWT_SECRET` na Vercel e crie admin (`scripts/sql/create-admin-user-pgadmin.sql` no RDS ou registo bootstrap).
