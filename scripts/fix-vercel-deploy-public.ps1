# Torna a API publica na Vercel: desliga SSO (Deployment Protection) e redeploy Production.
#
# Pre-requisito (uma vez):
#   npx vercel login
#   cd lanza-locacoes-services
#   npx vercel link --project lanza-locacoes-services --yes
#
# Uso:
#   .\scripts\fix-vercel-deploy-public.ps1
#   .\scripts\fix-vercel-deploy-public.ps1 -DryRun
#
# Alternativa com token (Settings -> Tokens em vercel.com/account/tokens):
#   $env:VERCEL_TOKEN = "..."
#   .\scripts\fix-vercel-deploy-public.ps1

param(
  [string]$ProjectName = "lanza-locacoes-services",
  [string]$TeamSlug = "lanzalocacoes",
  [string]$ProductionUrl = "https://api.lanzalocacoes.vercel.app",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Get-VercelToken {
  if ($env:VERCEL_TOKEN?.Trim()) { return $env:VERCEL_TOKEN.Trim() }
  $authFile = Join-Path $env:USERPROFILE ".vercel\auth.json"
  if (Test-Path $authFile) {
    $auth = Get-Content $authFile -Raw | ConvertFrom-Json
    if ($auth.token) { return [string]$auth.token }
  }
  throw "Sem token Vercel. Execute: npx vercel login`nOu defina `$env:VERCEL_TOKEN (vercel.com/account/tokens)"
}

function Invoke-VercelApi {
  param(
    [ValidateSet("GET", "PATCH", "POST", "DELETE")]
    [string]$Method,
    [string]$Path,
    [object]$Body = $null
  )
  $token = Get-VercelToken
  $query = "teamId=$TeamSlug"
  $uri = "https://api.vercel.com$Path" + $(if ($Path -match "\?") { "&$query" } else { "?$query" })
  $headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
  }
  $params = @{
    Method  = $Method
    Uri     = $uri
    Headers = $headers
  }
  if ($null -ne $Body) {
    $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress)
  }
  return Invoke-RestMethod @params
}

Write-Host "== Fix deploy publico: $ProjectName (team $TeamSlug) ==" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
  Write-Host "[dry-run] PATCH /v9/projects/$ProjectName -> ssoProtection: null"
  Write-Host "[dry-run] npx vercel redeploy --prod --yes"
  Write-Host "[dry-run] curl $ProductionUrl/health"
  exit 0
}

Write-Host "1/3 Desligar Vercel Authentication (SSO)..."
try {
  $patched = Invoke-VercelApi -Method PATCH -Path "/v9/projects/$ProjectName" -Body @{ ssoProtection = $null }
  Write-Host "   OK — ssoProtection desligado (project id: $($patched.id))"
} catch {
  Write-Host "   AVISO: PATCH falhou: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "   Tente manualmente: Settings -> Deployment Protection -> Vercel Authentication -> Disabled"
}

Write-Host ""
Write-Host "2/3 Redeploy Production..."
$ErrorActionPreference = "Continue"
$redeploy = npx vercel deploy --prod --yes 2>&1
$redeploy | ForEach-Object { Write-Host "   $_" }
if ($LASTEXITCODE -ne 0) {
  Write-Host "   AVISO: redeploy CLI falhou — faca Redeploy manual no dashboard (Deployments -> ... -> Redeploy)" -ForegroundColor Yellow
} else {
  Write-Host "   OK — redeploy iniciado"
}
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "3/3 Aguardar propagacao (30s)..."
Start-Sleep -Seconds 30

Write-Host ""
Write-Host "Testando $ProductionUrl/health ..."
$ErrorActionPreference = "Continue"
$curl = curl.exe --ssl-no-revoke -s -w "`nHTTP:%{http_code} TIME:%{time_total}s`n" --max-time 25 "$ProductionUrl/health" 2>&1
$curl | ForEach-Object { Write-Host $_ }

if ($curl -match '"status"\s*:\s*"ok"') {
  Write-Host ""
  Write-Host "SUCESSO — API publica e respondendo em $ProductionUrl" -ForegroundColor Green
  exit 0
}

Write-Host ""
Write-Host "Ainda sem resposta OK. Verifique no dashboard:" -ForegroundColor Yellow
Write-Host "  - Settings -> Domains -> api.lanzalocacoes.vercel.app (Production, neste projeto)"
Write-Host "  - Se o dominio estiver no projeto antigo 'lanza-locacoes', remova la e adicione aqui"
Write-Host "  - Settings -> Deployment Protection -> Vercel Authentication = Disabled"
Write-Host "  - Deployments -> ultimo Production -> Redeploy"
exit 1
