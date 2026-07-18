# Define senha do utilizador postgres no RDS via IAM (AWS CLI) + ALTER ROLE.
# Nao precisa de Query Editor nem psql.
#
# Pre-requisitos:
#   winget install Amazon.AWSCLI
#   aws configure   (conta 154601375525, regiao us-east-1)
#
# Uso:
#   .\scripts\postgres-set-password.ps1 -Password "LocaLanza"

param(
  [Parameter(Mandatory = $true)]
  [string]$Password
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Write-Host "AWS CLI nao instalado." -ForegroundColor Red
  Write-Host "  winget install Amazon.AWSCLI" -ForegroundColor Yellow
  Write-Host "  aws configure" -ForegroundColor Yellow
  exit 1
}

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  Write-Host "A ligar via IAM e executar ALTER ROLE..."
  npm run lanza -- postgres set-password $Password
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  .\scripts\set-postgres-user-env.ps1 -Password $Password
  npm run lanza -- postgres check
} finally {
  Pop-Location
}
