# Grava variáveis PostgreSQL / RDS AWS nas variáveis de ambiente persistentes do utilizador (Windows).
# Não use `.env` para credenciais (PGPASSWORD).
#
# Uso (PowerShell):
#   .\scripts\set-postgres-user-env.ps1
#   .\scripts\set-postgres-user-env.ps1 -Password "<senha>"   # em vez de IAM
#
# Depois: feche e reabra terminais (ou reinicie o Cursor).

param(
  [string]$AwsAccountId = "154601375525",
  [string]$AwsRegion = "us-east-1",
  [string]$AwsResourceArn = "arn:aws:rds:us-east-1:154601375525:cluster:aws-pg-lanza-locacoes",
  [string]$AwsResourceType = "rds",
  [string]$AwsRoleArn = "arn:aws:iam::154601375525:role/Vercel/access-pg-lanza-locacoes",
  [string]$PgDatabase = "postgres",
  [string]$PgHost = "aws-pg-lanza-locacoes.cluster-c856s8wi6jzs.us-east-1.rds.amazonaws.com",
  [string]$PgPort = "5432",
  [string]$PgSslMode = "require",
  [string]$PgUser = "postgres",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "sync-user-env.ps1")

function Set-UserEnv([string]$Name, [string]$Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-ProcessEnv $Name $Value
  Write-Host "  $Name"
}

Write-Host "Gravando variaveis PostgreSQL/RDS (utilizador)..."

Set-UserEnv "AWS_ACCOUNT_ID" $AwsAccountId.Trim()
Set-UserEnv "AWS_REGION" $AwsRegion.Trim()
Set-UserEnv "AWS_RESOURCE_ARN" $AwsResourceArn.Trim()
Set-UserEnv "AWS_RESOURCE_TYPE" $AwsResourceType.Trim()
Set-UserEnv "AWS_ROLE_ARN" $AwsRoleArn.Trim()
Set-UserEnv "PGDATABASE" $PgDatabase.Trim()
Set-UserEnv "PGHOST" $PgHost.Trim()
Set-UserEnv "PGPORT" $PgPort.Trim()
Set-UserEnv "PGSSLMODE" $PgSslMode.Trim()
Set-UserEnv "PGUSER" $PgUser.Trim()
Set-UserEnv "LANZA_DB_BACKEND" "dual"

if ($Password.Trim()) {
  Set-UserEnv "PGPASSWORD" $Password.Trim()
} else {
  [Environment]::SetEnvironmentVariable("PGPASSWORD", $null, "User")
  Set-ProcessEnv "PGPASSWORD" ""
  Write-Host "  PGPASSWORD (removido - usara token IAM via AWS_ROLE_ARN)"
}

Write-Host ""
Write-Host "OK: variaveis PostgreSQL gravadas (utilizador + sessao atual)."
Write-Host "    Autenticacao: $(if ($Password.Trim()) { 'senha estatica (PGPASSWORD)' } else { 'IAM (RDS Signer + AWS_ROLE_ARN)' })"
Write-Host "    Backend:      LANZA_DB_BACKEND=dual (grava JSON + PostgreSQL)"
Write-Host ""
Write-Host "Testar: npm run lanza -- postgres check"
