# Login assistido no Pedagio Digital (pedagiodigital.com): abre Chrome REAL via CDP,
# voce faz login (CPF/senha + reCAPTCHA) e grava PEDAGIO_DIGITAL_COOKIE + CSRf.
#
#   .\scripts\login-pedagio.ps1 -Cpf "<cpf>" -Senha "<senha>"
#   .\scripts\login-pedagio.ps1
#   .\scripts\login-pedagio.ps1 -Fresh
#   .\scripts\login-pedagio.ps1 -Playwright   # legado (Playwright)
#
# As credenciais NAO vao para `.env` nem para o Git - so para variaveis do utilizador.

param(
  [string]$Cpf,
  [string]$Senha,
  [switch]$Playwright,
  [switch]$Fresh
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if ($Cpf) {
  $c = $Cpf.Trim()
  [Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_LOGIN", $c, "User")
  $env:PEDAGIO_DIGITAL_LOGIN = $c
}
if ($Senha) {
  [Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_SENHA", $Senha.Trim(), "User")
  $env:PEDAGIO_DIGITAL_SENHA = $Senha.Trim()
}

$captureFile = Join-Path ([System.IO.Path]::GetTempPath()) "pedagio_capture.json"
if (Test-Path $captureFile) { Remove-Item $captureFile -Force }

Push-Location $repoRoot
try {
  if ($Fresh) {
    $profileDir = Join-Path $repoRoot ".cache\pedagio-digital\chrome-profile"
    if (Test-Path $profileDir) {
      Write-Host "Limpando perfil Chrome ($profileDir)..."
      Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue
    }
  }

  if ($Playwright) {
    Write-Host "Modo Playwright (legado)."
    & npx tsx src/run.ts pedagio-digital login
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $sessionFile = Join-Path $repoRoot ".cache\pedagio-digital\session.json"
    if (-not (Test-Path $sessionFile)) {
      Write-Error "Login concluido mas sessao nao encontrada em $sessionFile"
      exit 1
    }
    $data = Get-Content $sessionFile -Raw | ConvertFrom-Json
  } else {
    Write-Host "Abrindo Chrome real (CDP) - faca login e resolva o reCAPTCHA na janela."
    Write-Host "  Apos entrar, aguarde a lista de placas (F5 se nao carregar). Nao feche o Chrome manualmente."
    & npx tsx scripts/capturarPedagioCdp.ts
    if (-not (Test-Path $captureFile)) {
      Write-Error "Captura nao gerou sessao. Entrou no portal e a lista de placas carregou? Tente: .\login-pedagio.ps1 -Fresh"
      exit 1
    }
    $data = Get-Content $captureFile -Raw | ConvertFrom-Json
    Remove-Item $captureFile -Force
  }
} finally {
  Pop-Location
}

if (-not $data.cookie -or -not $data.csrf) {
  Write-Error "Sessao incompleta (cookie/csrf em falta)."
  exit 1
}

[Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_COOKIE", [string]$data.cookie, "User")
[Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_CSRF", [string]$data.csrf, "User")
$env:PEDAGIO_DIGITAL_COOKIE = [string]$data.cookie
$env:PEDAGIO_DIGITAL_CSRF = [string]$data.csrf

Write-Host "OK: PEDAGIO_DIGITAL_COOKIE e PEDAGIO_DIGITAL_CSRF gravados nas variaveis de ambiente do utilizador."
Write-Host "    Sessao cacheada em .cache/pedagio-digital/ (renova sozinha enquanto o perfil for valido)."
Write-Host "    Feche e reabra os terminais (ou o Cursor) para os outros processos verem os novos valores."
