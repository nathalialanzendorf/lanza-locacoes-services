# Abre psql no RDS Lanza com token IAM (AWS CLI).
# Equivalente bash:
#   export RDSHOST="aws-pg-lanza-locacoes.cluster-....us-east-1.rds.amazonaws.com"
#   psql "host=$RDSHOST port=5432 dbname=postgres user=postgres sslmode=require \
#     password=$(aws rds generate-db-auth-token --hostname $RDSHOST --port 5432 --username postgres --region us-east-1)"
#
# Pré-requisitos:
#   - AWS CLI instalado e autenticado (aws configure / SSO)
#   - IAM com rds-db:connect no cluster (credenciais directas — NÃO a role Vercel OIDC)
#   - psql no PATH (cliente PostgreSQL)
#
# Uso:
#   .\scripts\postgres-psql.ps1
#   .\scripts\postgres-psql.ps1 -Query "SELECT version();"

param(
  [string]$RdsHost = "",
  [string]$Port = "",
  [string]$Database = "",
  [string]$User = "",
  [string]$Region = "",
  [string]$Query = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "sync-user-env.ps1")
Sync-UserEnvToProcess

function Resolve-Env([string]$Override, [string]$VarName, [string]$Default) {
  if ($Override.Trim()) { return $Override.Trim() }
  $fromEnv = [Environment]::GetEnvironmentVariable($VarName, "Process")
  if (-not $fromEnv) { $fromEnv = [Environment]::GetEnvironmentVariable($VarName, "User") }
  if ($fromEnv) { return $fromEnv.Trim() }
  return $Default
}

$pgHost = Resolve-Env $RdsHost "PGHOST" ""
$pgPort = Resolve-Env $Port "PGPORT" "5432"
$pgDatabase = Resolve-Env $Database "PGDATABASE" "postgres"
$pgUser = Resolve-Env $User "PGUSER" "postgres"
$awsRegion = Resolve-Env $Region "AWS_REGION" "us-east-1"

if (-not $pgHost) {
  Write-Host "PGHOST nao definido. Execute: .\scripts\set-postgres-user-env.ps1" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  $awsCandidates = @(
    "$env:LOCALAPPDATA\Programs\Amazon\AWSCLIV2\aws.exe",
    "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
  )
  foreach ($candidate in $awsCandidates) {
    if (Test-Path $candidate) {
      $env:Path = "$(Split-Path $candidate -Parent);$env:Path"
      break
    }
  }
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Write-Host "AWS CLI nao encontrado. Instale: https://aws.amazon.com/cli/" -ForegroundColor Red
  exit 1
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  $psqlCandidates = @(
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe",
    "C:\Program Files\PostgreSQL\14\bin\psql.exe"
  )
  foreach ($candidate in $psqlCandidates) {
    if (Test-Path $candidate) {
      $env:Path = "$(Split-Path $candidate -Parent);$env:Path"
      break
    }
  }
}

if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
  Write-Host "psql nao encontrado. Instale o cliente PostgreSQL." -ForegroundColor Red
  exit 1
}

Write-Host "Gerando token IAM (valido ~15 min)..."
$token = aws rds generate-db-auth-token `
  --hostname $pgHost `
  --port $pgPort `
  --username $pgUser `
  --region $awsRegion 2>&1

if ($LASTEXITCODE -ne 0) {
  Write-Host "Falha ao gerar token IAM:" -ForegroundColor Red
  Write-Host $token
  exit 1
}

$env:PGPASSWORD = $token.Trim()
$conn = "host=$pgHost port=$pgPort dbname=$pgDatabase user=$pgUser sslmode=require"

if ($Query.Trim()) {
  psql $conn -c $Query.Trim()
} else {
  psql $conn
}

exit $LASTEXITCODE
