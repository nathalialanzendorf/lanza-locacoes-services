# Testa autenticação AWS CLI → token IAM RDS (sem senha estática).
#
# Uso:
#   .\scripts\postgres-aws-check.ps1

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "sync-user-env.ps1")
Sync-UserEnvToProcess

$pgHost = $env:PGHOST
$pgPort = if ($env:PGPORT) { $env:PGPORT } else { "5432" }
$pgUser = if ($env:PGUSER) { $env:PGUSER } else { "postgres" }
$region = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }

if (-not $pgHost) {
  Write-Host "Execute primeiro: .\scripts\set-postgres-user-env.ps1" -ForegroundColor Yellow
  exit 1
}

Write-Host "1. AWS CLI..."
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Write-Host "   AWS CLI nao instalado. https://aws.amazon.com/cli/" -ForegroundColor Red
  exit 1
}

Write-Host "2. Identidade AWS..."
try {
  $id = aws sts get-caller-identity | ConvertFrom-Json
  Write-Host ("   Account: {0}" -f $id.Account)
  Write-Host ("   Arn:     {0}" -f $id.Arn)
} catch {
  Write-Host "   Falhou. Rode: aws configure  (ou aws sso login)" -ForegroundColor Red
  exit 1
}

Write-Host "3. Token IAM RDS..."
$token = aws rds generate-db-auth-token `
  --hostname $pgHost --port $pgPort --username $pgUser --region $region 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Host "   Falhou:" -ForegroundColor Red
  Write-Host $token
  exit 1
}
Write-Host ("   OK ({0} chars, valido ~15 min)" -f $token.Trim().Length)

Write-Host "4. Lanza postgres check..."
Push-Location (Split-Path $PSScriptRoot -Parent)
npm run lanza -- postgres check
$code = $LASTEXITCODE
Pop-Location
exit $code
