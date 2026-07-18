# Espelha database/*.json no PostgreSQL de produção via API Vercel (sem Postgres local).
#
# Pré-requisitos:
#   1. LANZA_MIGRATE_SECRET definido no projeto Vercel lanza-locacoes (Production)
#   2. Redeploy da API após gravar o secret
#   3. database/*.json commitados e deployados (ou stores já no deploy actual)
#
# Uso:
#   .\scripts\migrar-postgres-vercel.ps1 -Secret "seu-secret"
#   .\scripts\migrar-postgres-vercel.ps1 -Secret "seu-secret" -DryRun
#   .\scripts\migrar-postgres-vercel.ps1 -Secret "seu-secret" -Stores @("veiculos.json","clientes.json")

param(
  [Parameter(Mandatory = $true)]
  [string]$Secret,
  [string]$ApiBase = "https://api.lanzalocacoes.vercel.app",
  [string[]]$Stores = @(),
  [switch]$DryRun,
  [switch]$SchemaOnly
)

$ErrorActionPreference = "Stop"

Write-Host "Verificando estado do Postgres na Vercel..."
$status = Invoke-RestMethod -Uri "$ApiBase/api/admin/db-status" -Method GET -TimeoutSec 30
Write-Host ("  postgres.ok = {0}" -f $status.postgres.ok)
if ($status.stores -and $status.stores.Count -gt 0) {
  Write-Host ("  stores ({0}): {1}" -f $status.stores.Count, ($status.stores -join ", "))
}

$body = @{}
if ($DryRun) { $body.dryRun = $true }
if ($SchemaOnly) { $body.importJson = $false }
if ($Stores.Count -gt 0) { $body.stores = $Stores }

$json = if ($body.Count -gt 0) { $body | ConvertTo-Json -Compress } else { "{}" }

Write-Host ""
Write-Host "POST $ApiBase/api/admin/migrar ..."
try {
  $result = Invoke-RestMethod `
    -Uri "$ApiBase/api/admin/migrar" `
    -Method POST `
    -Headers @{ "X-Migrate-Secret" = $Secret.Trim() } `
    -ContentType "application/json" `
    -Body $json `
    -TimeoutSec 120

  $result | ConvertTo-Json -Depth 6
  Write-Host ""
  Write-Host "OK - migracao concluida." -ForegroundColor Green
} catch {
  $resp = $_.ErrorDetails.Message
  if ($resp) {
    Write-Host $resp -ForegroundColor Red
  } else {
    Write-Host $_.Exception.Message -ForegroundColor Red
  }
  Write-Host ""
  Write-Host "Se 401: confira LANZA_MIGRATE_SECRET na Vercel + redeploy." -ForegroundColor Yellow
  exit 1
}
