# Cria o utilizador admin do painel Lanza Web no PostgreSQL (lanza.users).
#
# Credenciais por defeito:
#   E-mail: lanza_admin@lanza.local
#   Senha:  LocaLanza
#
# Uso:
#   .\scripts\create-admin-user.ps1
#   .\scripts\create-admin-user.ps1 -Reset
#   .\scripts\create-admin-user.ps1 -Email "admin@exemplo.com" -Password "OutraSenha123"
#
# Pré-requisitos:
#   1. Variáveis Postgres: .\scripts\set-postgres-user-env.ps1 -PromptPassword
#   2. (Opcional) Fechar e reabrir o terminal após set-postgres-user-env.ps1

param(
  [string]$Email = "lanza_admin@lanza.local",
  [string]$Password = "LocaLanza",
  [string]$Name = "lanza_admin",
  [switch]$Reset,
  [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "sync-user-env.ps1")
Sync-UserEnvToProcess

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

$env:LANZA_DB_BACKEND = "postgres"

if (-not $env:PGHOST -and -not $env:DATABASE_URL) {
  Write-Host "PostgreSQL nao configurado nesta sessao." -ForegroundColor Yellow
  Write-Host "Execute primeiro: .\scripts\set-postgres-user-env.ps1 -PromptPassword" -ForegroundColor Yellow
  exit 1
}

$tsxArgs = @(
  "scripts/create-postgres-admin-user.ts",
  "--email", $Email,
  "--password", $Password,
  "--name", $Name
)
if ($Reset) {
  $tsxArgs += "--reset"
}
if ($SkipMigrate) {
  $tsxArgs += "--skip-migrate"
}

Write-Host "A criar utilizador admin no PostgreSQL..." -ForegroundColor Cyan
npx tsx @tsxArgs
