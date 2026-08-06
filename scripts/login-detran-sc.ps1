# Login assistido no DETRAN SC (servicos.detran.sc.gov.br): abre Chrome REAL via CDP
# (nao Playwright), faz login gov.br com certificado A1 + hCaptcha e grava nas
# variaveis de ambiente do utilizador: DETRAN_SC_AUTH, DETRAN_SC_EMPRESA e
# (se capturado) DETRAN_SC_APP_VERSION.
#
# Por defeito usa capturarDetranCdp.ts — o gov.br exige hCaptcha no login por
# certificado; navegador automatizado (Playwright) costuma falhar com 302/ECONNRESET.
#
#   # Recomendado (Chrome real):
#   .\scripts\login-detran-sc.ps1
#
#   # 1a vez com .pfx (importa para o Windows + auto-selecao no Chrome):
#   .\scripts\login-detran-sc.ps1 -Pfx "C:\caminho\certificado.pfx" -PfxPass "<senha>"
#
#   # Perfil Chrome corrompido / 400 ou 302 repetidos — limpa sessao gov.br:
#   .\scripts\login-detran-sc.ps1 -Fresh
#
# Para varrer a frota com Turnstile automatico apos o login, use:
#   npx tsx scripts/detranSolver.ts
#
# As credenciais NAO vao para `.env` nem para o Git — so para variaveis do utilizador.

param(
  [string]$Pfx,
  [string]$PfxPass,
  [switch]$Playwright,
  [switch]$Manual,
  [switch]$Fresh
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if ($Pfx) {
  $p = $Pfx.Trim()
  if (-not (Test-Path $p)) { Write-Error "Arquivo .pfx nao encontrado: $p"; exit 1 }
  [Environment]::SetEnvironmentVariable("DETRAN_PFX_PATH", $p, "User")
  $env:DETRAN_PFX_PATH = $p
}
if ($PfxPass) {
  [Environment]::SetEnvironmentVariable("DETRAN_PFX_PASS", $PfxPass, "User")
  $env:DETRAN_PFX_PASS = $PfxPass
}

$captureFile = Join-Path ([System.IO.Path]::GetTempPath()) "detran_capture.json"
if (Test-Path $captureFile) { Remove-Item $captureFile -Force }

Push-Location $repoRoot
try {
  if ($Fresh) {
    $profileDir = Join-Path ([System.IO.Path]::GetTempPath()) "lanza_chrome_detran"
    if (Test-Path $profileDir) {
      Write-Host "Limpando perfil Chrome dedicado ($profileDir)..."
      Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  if (-not $Playwright -and ($env:DETRAN_PFX_PATH -or $Pfx)) {
    Write-Host "Importando certificado A1 para o Windows e configurando auto-selecao no Chrome..."
    & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/detranCertSetup.ps1
  }

  if ($Playwright) {
    Write-Host "Modo Playwright (legado) — prefira o padrao CDP se hCaptcha/302 falhar."
    $scriptArgs = @("tsx", "scripts/capturarDetranToken.ts", "--os-cert")
    if ($Manual) { $scriptArgs += "--manual" }
  } else {
    Write-Host "Abrindo Chrome real (CDP) — resolva o hCaptcha no login por certificado."
    $scriptArgs = @("tsx", "scripts/capturarDetranCdp.ts")
  }

  & npx @scriptArgs
} finally {
  Pop-Location
}

if (-not (Test-Path $captureFile)) {
  Write-Error @"
Captura nao gerou token (ficheiro ausente).
Se viu HTTP 302 no gov.br: o hCaptcha provavelmente falhou — tente de novo no Chrome real.
Se viu HTTP 400: nao use curl; entre pelo portal servicos.detran.sc.gov.br ou rode com -Fresh.
Consulte um veiculo no portal antes de fechar a janela.
"@
  exit 1
}

$data = Get-Content $captureFile -Raw | ConvertFrom-Json
Remove-Item $captureFile -Force

if (-not $data.auth -or -not $data.empresa) {
  Write-Error "Captura incompleta (auth/empresa em falta). Consulte um veiculo no portal antes de fechar o Chrome."
  exit 1
}

$auth = [string]$data.auth
if ($auth -match '^\s*Bearer\s+') {
  $auth = ($auth -replace '^\s*Bearer\s+', '').Trim()
}

[Environment]::SetEnvironmentVariable("DETRAN_SC_AUTH", $auth, "User")
[Environment]::SetEnvironmentVariable("DETRAN_SC_EMPRESA", [string]$data.empresa, "User")
$env:DETRAN_SC_AUTH = $auth
$env:DETRAN_SC_EMPRESA = [string]$data.empresa

if ($data.appVersion) {
  [Environment]::SetEnvironmentVariable("DETRAN_SC_APP_VERSION", [string]$data.appVersion, "User")
  $env:DETRAN_SC_APP_VERSION = [string]$data.appVersion
}

Write-Host "OK: DETRAN_SC_AUTH e DETRAN_SC_EMPRESA gravados nas variaveis de ambiente do utilizador."
if ($data.appVersion) {
  Write-Host "    DETRAN_SC_APP_VERSION=$($data.appVersion)"
}
Write-Host "    Token valido por algumas horas; ao expirar (HTTP 401), rode este script de novo."
Write-Host "    Feche e reabra os terminais (ou o Cursor) para os outros processos verem os novos valores."
