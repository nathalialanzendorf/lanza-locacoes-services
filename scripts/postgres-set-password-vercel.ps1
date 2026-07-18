# Define senha estática do postgres no RDS via API Vercel (OIDC/IAM — sem AWS CLI local).
#
# 1. Vercel -> lanza-locacoes -> LANZA_MIGRATE_SECRET + redeploy
# 2. .\scripts\postgres-set-password-vercel.ps1 -Secret "..." -Password "LocaLanza"

param(
  [Parameter(Mandatory = $true)]
  [string]$Secret,
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [string]$ApiBase = "https://api.lanzalocacoes.vercel.app"
)

$ErrorActionPreference = "Stop"

if ($Password.Trim().Length -lt 8) {
  Write-Host "Senha deve ter pelo menos 8 caracteres." -ForegroundColor Red
  exit 1
}

$body = @{ password = $Password.Trim() } | ConvertTo-Json -Compress

Write-Host "POST $ApiBase/api/admin/postgres-password ..."
try {
  $result = Invoke-RestMethod `
    -Uri "$ApiBase/api/admin/postgres-password" `
    -Method POST `
    -Headers @{ "X-Migrate-Secret" = $Secret.Trim() } `
    -ContentType "application/json" `
    -Body $body `
    -TimeoutSec 60
  $result | ConvertTo-Json
  Write-Host ""
  Write-Host "OK. Agora localmente:" -ForegroundColor Green
  Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\set-postgres-user-env.ps1 -Password `"$($Password.Trim())`""
  Write-Host "  npm run lanza -- postgres check"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  $resp = $_.ErrorDetails.Message
  Write-Host "HTTP $code" -ForegroundColor Red
  if ($resp) { Write-Host $resp }
  if ($code -eq 404) {
    Write-Host "Endpoint ainda nao deployado — faca push + redeploy da API." -ForegroundColor Yellow
  }
  exit 1
}
