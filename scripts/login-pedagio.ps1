# Login assistido no Pedagio Digital (pedagiodigital.com): abre Chrome,
# preenche CPF+senha (se configurados), voce resolve o reCAPTCHA e grava
# PEDAGIO_DIGITAL_COOKIE + PEDAGIO_DIGITAL_CSRF nas variaveis do utilizador.
#
#   # 1a vez (guarda CPF/senha):
#   .\scripts\login-pedagio.ps1 -Cpf "<cpf>" -Senha "<senha>"
#   # Depois (reaproveita credenciais ja guardadas):
#   .\scripts\login-pedagio.ps1
#
# As credenciais NAO vao para `.env` nem para o Git — so para variaveis do utilizador.

param(
  [string]$Cpf,
  [string]$Senha
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

Push-Location $repoRoot
try {
  & npx tsx src/run.ts pedagio-digital login
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}

$sessionFile = Join-Path $repoRoot ".cache\pedagio-digital\session.json"
if (-not (Test-Path $sessionFile)) {
  Write-Error "Login concluido mas sessao nao encontrada em $sessionFile"
  exit 1
}

$data = Get-Content $sessionFile -Raw | ConvertFrom-Json
if (-not $data.cookie -or -not $data.csrf) {
  Write-Error "Sessao incompleta (cookie/csrf em falta)."
  exit 1
}

[Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_COOKIE", [string]$data.cookie, "User")
[Environment]::SetEnvironmentVariable("PEDAGIO_DIGITAL_CSRF", [string]$data.csrf, "User")
$env:PEDAGIO_DIGITAL_COOKIE = [string]$data.cookie
$env:PEDAGIO_DIGITAL_CSRF = [string]$data.csrf

Write-Host "OK: PEDAGIO_DIGITAL_COOKIE e PEDAGIO_DIGITAL_CSRF gravados nas variaveis de ambiente do utilizador."
Write-Host "    Sessao tambem cacheada em .cache/pedagio-digital/ (renova sozinha enquanto o perfil for valido)."
Write-Host "    Feche e reabra os terminais (ou o Cursor) para os outros processos verem os novos valores."
