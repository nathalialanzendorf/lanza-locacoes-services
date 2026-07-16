# Define variáveis PostgreSQL/RDS no projeto Vercel da API (lanza-locacoes).
#
# Pré-requisito: Vercel CLI autenticado
#   npx vercel login
#   npx vercel link   # na raiz do repositório, projeto da API
#
# Uso:
#   .\scripts\set-vercel-postgres-env.ps1
#   .\scripts\set-vercel-postgres-env.ps1 -Backend dual
#   .\scripts\set-vercel-postgres-env.ps1 -DryRun

param(
  [ValidateSet("postgres", "dual")]
  [string]$Backend = "dual",
  [string]$ProjectName = "lanza-locacoes",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Valores do RDS (mesmos de set-postgres-user-env.ps1 / integração Vercel OIDC)
$vars = [ordered]@{
  LANZA_DB_BACKEND     = $Backend
  PGHOST               = "aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com"
  PGPORT               = "5432"
  PGDATABASE           = "postgres"
  PGUSER               = "postgres"
  PGSSLMODE            = "require"
  AWS_REGION           = "us-east-1"
  AWS_ACCOUNT_ID       = "154601375525"
  AWS_RESOURCE_ARN     = "arn:aws:rds:us-east-1:154601375525:cluster:aws-pg-lanza-locacoes"
  AWS_RESOURCE_TYPE    = "rds"
  AWS_ROLE_ARN         = "arn:aws:iam::154601375525:role/Vercel/access-pg-lanza-locacoes"
  LANZA_WEB_URL        = "https://lanzalocacoes.vercel.app"
  LANZA_API_PUBLIC_URL = "https://api.lanzalocacoes.vercel.app"
}

Write-Host "Projeto Vercel: $ProjectName"
Write-Host "Backend:        LANZA_DB_BACKEND=$Backend"
Write-Host ""
Write-Host "Variaveis a gravar (Production + Preview + Development):"
foreach ($kv in $vars.GetEnumerator()) {
  Write-Host ("  {0}={1}" -f $kv.Key, $kv.Value)
}
Write-Host ""

if ($DryRun) {
  Write-Host "[dry-run] Nenhuma alteracao feita."
  exit 0
}

$whoami = npx vercel whoami 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERRO: Vercel CLI nao autenticado. Execute: npx vercel login" -ForegroundColor Red
  exit 1
}
Write-Host "Vercel: $whoami"
Write-Host ""

foreach ($kv in $vars.GetEnumerator()) {
  $name = $kv.Key
  $value = $kv.Value
  Write-Host "-> $name"
  # Remove valor anterior (ignora se nao existir) e adiciona nos 3 ambientes
  npx vercel env rm $name production --yes 2>$null | Out-Null
  npx vercel env rm $name preview --yes 2>$null | Out-Null
  npx vercel env rm $name development --yes 2>$null | Out-Null
  $value | npx vercel env add $name production preview development --yes 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "   falhou (tente pelo dashboard Vercel)" -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "OK. Faca Redeploy do projeto API na Vercel."
Write-Host "Verificar: curl https://api.lanzalocacoes.vercel.app/health"
Write-Host ""
Write-Host 'Esperado (backend postgres):'
Write-Host @'
{
  "database": { "backend": "postgres", "postgres": { "ok": true } }
}
'@
Write-Host ""
Write-Host 'Esperado (backend dual — grava JSON + Postgres):'
Write-Host @'
{
  "database": { "backend": "dual", "postgres": { "ok": true } }
}
'@
