# Cutover PostgreSQL relacional (RDS / produção).
#
# 1. Aplica migrações SQL 001–015
# 2. Importa database/*.json → tabelas relacional
# 3. Verifica paridade JSON vs SQL
#
# Uso:
#   $env:LANZA_DATABASE_DIR = "D:\Dropbox\Aworklanza\lanza-locacoes-ai\database"
#   .\scripts\cutover-postgres-relational.ps1
#
# Variáveis Vercel recomendadas após cutover:
#   LANZA_DB_BACKEND=postgres
#   LANZA_DB_RELATIONAL=1

param(
  [string]$DatabaseDir = "",
  [switch]$DryRun,
  [switch]$SkipParity
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "sync-user-env.ps1")
Sync-UserEnvToProcess

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

if ($DatabaseDir) {
  $env:LANZA_DATABASE_DIR = $DatabaseDir
} elseif (-not $env:LANZA_DATABASE_DIR) {
  $aiDb = Join-Path (Split-Path $repoRoot -Parent) "lanza-locacoes-ai\database"
  if (Test-Path $aiDb) {
    $env:LANZA_DATABASE_DIR = $aiDb
  }
}

$env:LANZA_DB_BACKEND = "postgres"
$env:LANZA_DB_RELATIONAL = "1"

if (-not $env:PGHOST -and -not $env:DATABASE_URL) {
  Write-Host "PostgreSQL nao configurado. Execute: .\scripts\set-postgres-user-env.ps1 -PromptPassword" -ForegroundColor Red
  exit 1
}

Write-Host "Database dir: $(if ($env:LANZA_DATABASE_DIR) { $env:LANZA_DATABASE_DIR } else { Join-Path $repoRoot 'database' })" -ForegroundColor Cyan

$migrateArgs = @("scripts/migrate-json-to-relational.ts")
if ($DryRun) { $migrateArgs += "--dry-run" }

Write-Host "Migracao relacional..." -ForegroundColor Cyan
npx tsx @migrateArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipParity -and -not $DryRun) {
  Write-Host "Verificando paridade..." -ForegroundColor Cyan
  npx tsx scripts/parity-json-sql.ts
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Cutover concluido. Redeploy API com LANZA_DB_BACKEND=postgres e LANZA_DB_RELATIONAL=1." -ForegroundColor Green
