# Login assistido no SigaPay (sigapay.com.br): abre Chrome via CDP, captura
# cookie/token da rede e grava nas variaveis de ambiente do utilizador:
# SIGAPAY_COOKIE, SIGAPAY_TOKEN e (se capturado) SIGAPAY_API_BASE.
#
#   .\scripts\login-sigapay.ps1
#   .\scripts\login-sigapay.ps1 -Fresh
#
# Depois de logar, abra avisos/placas no portal para a captura automatica.
# As credenciais NAO vao para `.env` nem para o Git - so para variaveis do utilizador.

param(
  [switch]$Fresh
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

$captureFile = Join-Path ([System.IO.Path]::GetTempPath()) "sigapay_capture.json"
if (Test-Path $captureFile) { Remove-Item $captureFile -Force }

Push-Location $repoRoot
try {
  if ($Fresh) {
    $profileDir = Join-Path $repoRoot ".cache\sigapay\chrome-profile"
    if (Test-Path $profileDir) {
      Write-Host "Limpando perfil Chrome ($profileDir)..."
      Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  Write-Host "Abrindo Chrome real (CDP) - faca login no SigaPay."
  Write-Host "  Apos entrar, abra avisos ou placas (F5 se necessario). Nao feche o Chrome manualmente."
  & npx tsx scripts/capturarSigapayToken.ts
} finally {
  Pop-Location
}

if (-not (Test-Path $captureFile)) {
  Write-Error "Captura nao gerou sessao. Fez login e abriu avisos/placas? Tente: .\login-sigapay.ps1 -Fresh"
  exit 1
}

$data = Get-Content $captureFile -Raw | ConvertFrom-Json
Remove-Item $captureFile -Force

if (-not $data.cookie -and -not $data.token) {
  Write-Error "Captura incompleta (cookie/token em falta)."
  exit 1
}

if ($data.cookie) {
  [Environment]::SetEnvironmentVariable("SIGAPAY_COOKIE", [string]$data.cookie, "User")
  $env:SIGAPAY_COOKIE = [string]$data.cookie
}
if ($data.token) {
  $token = [string]$data.token
  if ($token -match '^\s*Bearer\s+') {
    $token = ($token -replace '^\s*Bearer\s+', '').Trim()
  }
  [Environment]::SetEnvironmentVariable("SIGAPAY_TOKEN", $token, "User")
  $env:SIGAPAY_TOKEN = $token
}
if ($data.apiBase) {
  [Environment]::SetEnvironmentVariable("SIGAPAY_API_BASE", [string]$data.apiBase, "User")
  $env:SIGAPAY_API_BASE = [string]$data.apiBase
}

Write-Host "OK: SIGAPAY_COOKIE e SIGAPAY_TOKEN gravados nas variaveis de ambiente do utilizador."
if ($data.apiBase) {
  Write-Host "    SIGAPAY_API_BASE=$($data.apiBase)"
}
Write-Host "    A sessao expira periodicamente; ao falhar (HTTP 401), rode este script de novo."
Write-Host "    Feche e reabra os terminais (ou o Cursor) para os outros processos verem os novos valores."
