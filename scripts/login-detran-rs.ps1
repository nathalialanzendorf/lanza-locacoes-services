# Login assistido no DETRAN RS via gov.br: abre Chrome REAL via CDP (nao Playwright),
# voce faz login e grava DETRAN_RS_AUTH + DETRAN_RS_USER_ID no env do utilizador.
#
#   .\scripts\login-detran-rs.ps1
#   .\scripts\login-detran-rs.ps1 -Pfx "C:\caminho\cert.pfx" -PfxPass "<senha>"
#   .\scripts\login-detran-rs.ps1 -Cpf "<cpf>" -Senha "<senha>"
#   .\scripts\login-detran-rs.ps1 -Fresh
#   .\scripts\login-detran-rs.ps1 -Playwright   # legado
#
# As credenciais NAO vao para `.env` nem para o Git - so para variaveis do utilizador.

param(
  [string]$Pfx,
  [string]$PfxPass,
  [string]$Cpf,
  [string]$Senha,
  [switch]$Playwright,
  [switch]$Manual,
  [switch]$Fresh
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if ($Pfx) {
  $p = $Pfx.Trim()
  if (-not (Test-Path $p)) { Write-Error "Arquivo .pfx nao encontrado: $p"; exit 1 }
  [Environment]::SetEnvironmentVariable("DETRAN_RS_PFX_PATH", $p, "User")
  $env:DETRAN_RS_PFX_PATH = $p
}
if ($PfxPass) {
  [Environment]::SetEnvironmentVariable("DETRAN_RS_PFX_PASS", $PfxPass, "User")
  $env:DETRAN_RS_PFX_PASS = $PfxPass
}
if ($Cpf) {
  $c = $Cpf.Trim()
  [Environment]::SetEnvironmentVariable("DETRAN_RS_GOV_CPF", $c, "User")
  $env:DETRAN_RS_GOV_CPF = $c
}
if ($Senha) {
  [Environment]::SetEnvironmentVariable("DETRAN_RS_GOV_SENHA", $Senha.Trim(), "User")
  $env:DETRAN_RS_GOV_SENHA = $Senha.Trim()
}

$captureFile = Join-Path ([System.IO.Path]::GetTempPath()) "detran_rs_capture.json"
if (Test-Path $captureFile) { Remove-Item $captureFile -Force }

Push-Location $repoRoot
try {
  if ($Fresh) {
    $profileDir = Join-Path ([System.IO.Path]::GetTempPath()) "lanza_chrome_detran_rs"
    if (Test-Path $profileDir) {
      Write-Host "Limpando perfil Chrome dedicado ($profileDir)..."
      Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  if (-not $Playwright -and ($env:DETRAN_RS_PFX_PATH -or $env:DETRAN_PFX_PATH -or $Pfx)) {
    Write-Host "Importando certificado A1 para o Windows (auto-selecao Chrome)..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/detranCertSetup.ps1
  }

  if ($Playwright) {
    Write-Host "Modo Playwright (legado)."
    $scriptArgs = @("tsx", "scripts/capturarDetranRsToken.ts", "--os-cert")
    if ($Manual) { $scriptArgs += "--manual" }
  } else {
    Write-Host "Abrindo Chrome real (CDP) - faca login gov.br e carregue a frota no portal."
    $scriptArgs = @("tsx", "scripts/capturarDetranRsCdp.ts")
  }

  & npx @scriptArgs
} finally {
  Pop-Location
}

if (-not (Test-Path $captureFile)) {
  Write-Error "Captura nao gerou token (ficheiro ausente). Concluiu o login gov.br e carregou o portal?"
  exit 1
}

$data = Get-Content $captureFile -Raw | ConvertFrom-Json
Remove-Item $captureFile -Force

if (-not $data.auth -or -not $data.userId) {
  Write-Error "Captura incompleta (auth/userId em falta). Repita o login ate o portal carregar a frota."
  exit 1
}

[Environment]::SetEnvironmentVariable("DETRAN_RS_AUTH", [string]$data.auth, "User")
[Environment]::SetEnvironmentVariable("DETRAN_RS_USER_ID", [string]$data.userId, "User")
$env:DETRAN_RS_AUTH = [string]$data.auth
$env:DETRAN_RS_USER_ID = [string]$data.userId

Write-Host "OK: DETRAN_RS_AUTH e DETRAN_RS_USER_ID gravados nas variaveis de ambiente do utilizador."
Write-Host "    Token valido por algumas horas; ao expirar (HTTP 401), rode este script de novo."
Write-Host "    Feche e reabra os terminais (ou o Cursor) para os outros processos verem os novos valores."
