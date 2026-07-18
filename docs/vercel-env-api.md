# Variáveis de ambiente — projeto API na Vercel

Projeto: **lanza-locacoes** (API em `https://api.lanzalocacoes.vercel.app`)

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
npx vercel link   # projeto lanza-locacoes
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
