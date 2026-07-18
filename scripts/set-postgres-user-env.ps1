# Grava variáveis PostgreSQL / RDS AWS nas variáveis de ambiente persistentes do utilizador (Windows).
# Não use `.env` para credenciais (PGPASSWORD).
#
# Uso (PowerShell):
#   .\scripts\set-postgres-user-env.ps1
#   .\scripts\set-postgres-user-env.ps1 -PromptPassword          # pede senha RDS (recomendado local)
#   .\scripts\set-postgres-user-env.ps1 -Password "<senha>"
#   .\scripts\set-postgres-user-env.ps1 -UseIam                    # remove PGPASSWORD (só se tiver AWS CLI)
#
# Autenticação local:
#   A) AWS CLI + token IAM: .\scripts\set-postgres-user-env.ps1 -UseIam && aws configure
#   B) Senha RDS:           .\scripts\set-postgres-user-env.ps1 -PromptPassword
#   AWS_ROLE_ARN (Vercel OIDC) funciona so na Vercel - local use A ou B.
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
  [string]$Password = "",
  [switch]$PromptPassword,
  [switch]$UseIam
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "sync-user-env.ps1")

function Set-UserEnv([string]$Name, [string]$Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-ProcessEnv $Name $Value
  Write-Host "  $Name"
}

if ($PromptPassword) {
  $secure = Read-Host "PGPASSWORD (senha RDS postgres)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
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
} elseif ($UseIam) {
  [Environment]::SetEnvironmentVariable("PGPASSWORD", $null, "User")
  Set-ProcessEnv "PGPASSWORD" ""
  Write-Host "  PGPASSWORD (removido - tentara IAM via credenciais AWS locais)"
} else {
  $existing = [Environment]::GetEnvironmentVariable("PGPASSWORD", "User")
  if ($existing) {
    Set-ProcessEnv "PGPASSWORD" $existing
    Write-Host "  PGPASSWORD (mantido - valor existente do utilizador)"
  } else {
    Write-Host "  PGPASSWORD (nao definido - sync local falhara sem senha ou AWS CLI)"
    Write-Host "             Use: .\scripts\set-postgres-user-env.ps1 -PromptPassword"
  }
}

$authMode = if ($Password.Trim()) {
  "senha estatica (PGPASSWORD)"
} elseif ($UseIam) {
  "IAM (credenciais AWS locais / rds-db:connect)"
} elseif ([Environment]::GetEnvironmentVariable("PGPASSWORD", "User")) {
  "senha estatica (PGPASSWORD existente)"
} else {
  "nao configurada (defina PGPASSWORD para sync local)"
}

Write-Host ""
Write-Host "OK: variaveis PostgreSQL gravadas (utilizador + sessao atual)."
Write-Host "    Autenticacao: $authMode"
Write-Host "    Backend:      LANZA_DB_BACKEND=dual (grava JSON + PostgreSQL)"
Write-Host ""
Write-Host "Testar: npm run lanza -- postgres check"
