# Define variáveis PostgreSQL/RDS no projeto Vercel da API (lanza-locacoes).
#
# Pré-requisito: Vercel CLI autenticado
#   npx vercel login
#   npx vercel link   # na raiz do repositório, projeto da API
#
# Uso:
#   .\scripts\set-vercel-postgres-env.ps1
#   .\scripts\set-vercel-postgres-env.ps1 -Backend postgres
#   .\scripts\set-vercel-postgres-env.ps1 -DryRun

param(
  [ValidateSet("postgres", "dual", "file")]
  [string]$Backend = "postgres",
  [string]$ProjectName = "lanza-locacoes-services",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Valores do RDS (mesmos de set-postgres-user-env.ps1 / integração Vercel OIDC)
$vars = [ordered]@{
  LANZA_DB_BACKEND     = $Backend
  LANZA_WEB_URL        = "https://lanzalocacoes.vercel.app"
  LANZA_API_PUBLIC_URL = "https://api.lanzalocacoes.vercel.app"
}

if ($Backend -ne "file") {
  $vars.PGHOST           = "aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com"
  $vars.PGPORT           = "5432"
  $vars.PGDATABASE       = "postgres"
  $vars.PGUSER           = "postgres"
  $vars.PGSSLMODE        = "require"
  $vars.AWS_REGION       = "us-east-1"
  $vars.AWS_ACCOUNT_ID   = "154601375525"
  $vars.AWS_RESOURCE_ARN = "arn:aws:rds:us-east-1:154601375525:cluster:aws-pg-lanza-locacoes"
  $vars.AWS_RESOURCE_TYPE = "rds"
  $vars.AWS_ROLE_ARN     = "arn:aws:iam::154601375525:role/Vercel/access-pg-lanza-locacoes"
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

$ErrorActionPreference = "Continue"
$whoami = (npx vercel whoami 2>&1 | Where-Object { $_ -is [string] -and $_.Trim() -and $_ -notmatch 'Warning|npm WARN|node:' } | Select-Object -Last 1).ToString().Trim()
if (-not $whoami) {
  Write-Host "ERRO: Vercel CLI nao autenticado. Execute: npx vercel login" -ForegroundColor Red
  exit 1
}
Write-Host "Vercel: $whoami"
Write-Host ""
$ErrorActionPreference = "Stop"

$ErrorActionPreference = "Continue"
foreach ($kv in $vars.GetEnumerator()) {
  $name = $kv.Key
  $value = $kv.Value
  Write-Host "-> $name"
  foreach ($envName in @("production", "preview", "development")) {
    npx vercel env rm $name $envName --yes 2>$null | Out-Null
    $value | npx vercel env add $name $envName --yes 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Host "   falhou em $envName (tente pelo dashboard Vercel)" -ForegroundColor Yellow
    }
  }
}
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "OK. Faca Redeploy do projeto API na Vercel."
Write-Host "Verificar: curl https://api.lanzalocacoes.vercel.app/health"
Write-Host ""
Write-Host 'Esperado (backend file — JSON em database/):'
Write-Host @'
{
  "database": { "backend": "file" }
}
'@
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
