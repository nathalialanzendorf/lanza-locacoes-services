# Liga ao RDS com token IAM copiado do AWS Console (Query Editor / RDS).
#
# O token NÃO é um URL de ligação — é a SENHA do PostgreSQL (válido ~15 min).
#
# Uso:
#   .\scripts\postgres-console-token.ps1 -Check
#   .\scripts\postgres-console-token.ps1 -Psql
#   .\scripts\postgres-console-token.ps1 -SetPassword "MinhaSenhaRds123"
#   .\scripts\postgres-console-token.ps1 -CreateAdmin
#
# O script pede o token (colar do console) ou usa -Token.

param(
  [string]$Token = "",
  [switch]$Check,
  [switch]$Psql,
  [string]$SetPassword = "",
  [switch]$CreateAdmin,
  [string]$Query = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "sync-user-env.ps1")
Sync-UserEnvToProcess

$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

if (-not $env:PGHOST) {
  Write-Host "PGHOST nao definido. Execute: .\scripts\set-postgres-user-env.ps1" -ForegroundColor Red
  exit 1
}

if (-not $Token.Trim()) {
  Write-Host @"
Cole o token IAM do AWS Console (comeca com o hostname e contem X-Amz-Algorithm).
Valido ~15 min — gere um novo no Query Editor se expirou.

"@ -ForegroundColor Cyan
  $Token = Read-Host "Token IAM (senha temporaria)"
}

$Token = $Token.Trim()
if ($Token.Length -lt 50) {
  Write-Host "Token parece invalido (muito curto). Copie a string completa do console AWS." -ForegroundColor Red
  exit 1
}

# Token IAM substitui PGPASSWORD apenas nesta sessao (nao grava no utilizador).
Remove-Item env:PGPASSWORD -ErrorAction SilentlyContinue
$env:PGPASSWORD = $Token
$env:LANZA_DB_BACKEND = "postgres"

Write-Host "Token IAM definido na sessao (nao persistido)." -ForegroundColor DarkGray
$pgUserDisplay = if ($env:PGUSER) { $env:PGUSER } else { "postgres" }
Write-Host "Host: $($env:PGHOST)  User: $pgUserDisplay" -ForegroundColor DarkGray

if ($SetPassword.Trim()) {
  Write-Host "A definir senha estatica para $pgUserDisplay..." -ForegroundColor Cyan
  npm run lanza -- postgres set-password $SetPassword --from-env
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  .\scripts\set-postgres-user-env.ps1 -Password $SetPassword
  npm run lanza -- postgres check
  exit $LASTEXITCODE
}

if ($CreateAdmin) {
  Write-Host "A criar utilizador admin..." -ForegroundColor Cyan
  npx tsx scripts/create-postgres-admin-user.ts --reset
  exit $LASTEXITCODE
}

if ($Psql) {
  $pgHost = $env:PGHOST
  $pgPort = if ($env:PGPORT) { $env:PGPORT } else { "5432" }
  $pgDatabase = if ($env:PGDATABASE) { $env:PGDATABASE } else { "postgres" }
  $pgUser = if ($env:PGUSER) { $env:PGUSER } else { "postgres" }

  if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    $psql16 = "C:\Program Files\PostgreSQL\16\bin\psql.exe"
    if (Test-Path $psql16) { $env:Path = "$(Split-Path $psql16 -Parent);$env:Path" }
  }

  $conn = "host=$pgHost port=$pgPort dbname=$pgDatabase user=$pgUser sslmode=require"
  if ($Query.Trim()) {
    psql $conn -c $Query.Trim()
  } else {
    psql $conn
  }
  exit $LASTEXITCODE
}

# Default: testar conexao
Write-Host "A testar conexao..." -ForegroundColor Cyan
npm run lanza -- postgres check
exit $LASTEXITCODE
