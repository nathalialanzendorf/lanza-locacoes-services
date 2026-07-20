# Grava token IAM RDS em PGPASSWORD e corre cutover relacional imediatamente.
# O token expira em ~15 min - gere e execute este script logo em seguida.
#
# Uso:
#   .\scripts\set-iam-token-cutover.ps1 -Token "<token completo>"
#   .\scripts\set-iam-token-cutover.ps1 -PromptToken
#
param(
  [string]$Token = "",
  [switch]$PromptToken,
  [string]$DatabaseDir = "D:\Dropbox\Aworklanza\lanza-locacoes-ai\database"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "sync-user-env.ps1")

if ($PromptToken) {
  $Token = Read-Host "Cole o token IAM RDS (linha completa)"
}

$Token = $Token.Trim()
if (-not $Token) {
  Write-Host "Token vazio. Use -Token ou -PromptToken." -ForegroundColor Red
  exit 1
}

function Set-UserEnv([string]$Name, [string]$Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-ProcessEnv $Name $Value
}

Set-UserEnv "PGPASSWORD" $Token
Set-UserEnv "PGHOST" "aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com"
Set-UserEnv "PGPORT" "5432"
Set-UserEnv "PGUSER" "postgres"
Set-UserEnv "PGDATABASE" "postgres"
Set-UserEnv "PGSSLMODE" "require"
Set-UserEnv "LANZA_DB_BACKEND" "postgres"
Set-UserEnv "LANZA_DB_RELATIONAL" "1"
Set-UserEnv "LANZA_DATABASE_DIR" $DatabaseDir

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

Write-Host "Testando ligacao..." -ForegroundColor Cyan
npm run db:check
if ($LASTEXITCODE -ne 0) {
  Write-Host "Falha na autenticacao - token expirado ou invalido. Gere um token novo." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Cutover relacional..." -ForegroundColor Cyan
npm run db:cutover
exit $LASTEXITCODE
