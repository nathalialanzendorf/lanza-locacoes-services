# Login assistido no Rastreame (rastreame.com.br): abre Chrome REAL via CDP,
# voce faz login e grava RASTREAME_AUTH no env do utilizador.
#
#   .\scripts\login-rastreame.ps1 -Login "<email>" -Senha "<senha>"
#   .\scripts\login-rastreame.ps1
#   .\scripts\login-rastreame.ps1 -Fresh
#   .\scripts\login-rastreame.ps1 -Playwright   # legado
#
# As credenciais NAO vao para `.env` nem para o Git - so para variaveis do utilizador.

param(
  [string]$Login,
  [string]$Senha,
  [switch]$Playwright,
  [switch]$Fresh
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if ($Login) {
  $l = $Login.Trim()
  [Environment]::SetEnvironmentVariable("RASTREAME_LOGIN", $l, "User")
  $env:RASTREAME_LOGIN = $l
}
if ($Senha) {
  [Environment]::SetEnvironmentVariable("RASTREAME_SENHA", $Senha.Trim(), "User")
  $env:RASTREAME_SENHA = $Senha.Trim()
}

$captureFile = Join-Path ([System.IO.Path]::GetTempPath()) "rastreame_capture.json"
if (Test-Path $captureFile) { Remove-Item $captureFile -Force }

Push-Location $repoRoot
try {
  if ($Fresh) {
    $profileDir = Join-Path ([System.IO.Path]::GetTempPath()) "lanza_chrome_rastreame"
    if (Test-Path $profileDir) {
      Write-Host "Limpando perfil Chrome ($profileDir)..."
      Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  if ($Playwright) {
    Write-Host "Modo Playwright (legado)."
    & npx tsx scripts/capturarRastreameLogin.ts
  } else {
    Write-Host "Abrindo Chrome real (CDP) - faca login no rastreame.com.br."
    & npx tsx scripts/capturarRastreameCdp.ts
  }
} finally {
  Pop-Location
}

if (-not (Test-Path $captureFile)) {
  Write-Error "Captura nao gerou token (ficheiro ausente). Concluiu o login no portal?"
  exit 1
}

$data = Get-Content $captureFile -Raw | ConvertFrom-Json
Remove-Item $captureFile -Force

if (-not $data.token) {
  Write-Error "Captura incompleta (token em falta)."
  exit 1
}

[Environment]::SetEnvironmentVariable("RASTREAME_AUTH", [string]$data.token, "User")
$env:RASTREAME_AUTH = [string]$data.token

Write-Host "OK: RASTREAME_AUTH gravado nas variaveis de ambiente do utilizador."
if ($data.authFormat) {
  Write-Host "    Formato authorization detectado: $($data.authFormat)"
}
Write-Host "    Feche e reabra os terminais (ou o Cursor) para os outros processos verem os novos valores."
