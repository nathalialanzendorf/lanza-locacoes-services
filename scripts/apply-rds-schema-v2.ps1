# Aplica schema v2 (015) no RDS — requer PGPASSWORD válido (token IAM ~15 min ou senha).
#
# 1. No console AWS RDS: "Connect" → copiar token IAM (ou senha)
# 2. Gravar:
#      [Environment]::SetEnvironmentVariable("PGPASSWORD", "<token>", "User")
#    ou: .\scripts\set-postgres-user-env.ps1 -PromptPassword
# 3. Executar este script (dentro de ~15 min se token IAM)

param(
  [switch]$SchemaOnly,
  [switch]$SkipParity
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "sync-user-env.ps1")
Sync-UserEnvToProcess

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

if (-not $env:PGHOST) {
  Write-Host "PGHOST nao configurado. Execute: .\scripts\set-postgres-user-env.ps1" -ForegroundColor Red
  exit 1
}

if (-not $env:PGPASSWORD) {
  Write-Host "PGPASSWORD nao configurado (token IAM expirado?)." -ForegroundColor Red
  Write-Host "  Cole novo token: [Environment]::SetEnvironmentVariable('PGPASSWORD', '<token>', 'User')"
  exit 1
}

$env:LANZA_DB_BACKEND = "postgres"
$env:LANZA_DB_RELATIONAL = "1"
if (-not $env:LANZA_DATABASE_DIR) {
  $aiDb = Join-Path (Split-Path $repoRoot -Parent) "lanza-locacoes-ai\database"
  if (Test-Path $aiDb) { $env:LANZA_DATABASE_DIR = $aiDb }
}

if ($SchemaOnly) {
  Write-Host "Aplicando schema 001-015..." -ForegroundColor Cyan
  npx tsx scripts/run-schema-only.ts
  exit $LASTEXITCODE
}

Write-Host "Cutover schema v2 + import JSON..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "cutover-postgres-relational.ps1") @PSBoundParameters
