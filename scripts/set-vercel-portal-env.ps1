# Grava credenciais Rastreame e Pedagio Digital no projeto API na Vercel.
# Wrapper PowerShell -> scripts/set-vercel-portal-env.mjs (REST API).
#
# Rastreame: login/senha bastam para login automatico na Vercel (sem browser).
# Pedagio:   login/senha + solver reCAPTCHA (Capsolver/2captcha) na Vercel.
#
# Uso:
#   .\scripts\set-vercel-portal-env.ps1 -RastreameLogin "email" -RastreameSenha "senha" `
#     -PedagioLogin "cpf" -PedagioSenha "senha" `
#     -PedagioCaptchaProvider capsolver -PedagioCaptchaApiKey "..."
#
#   # Ler do env do utilizador Windows (RASTREAME_*, PEDAGIO_DIGITAL_*):
#   .\scripts\set-vercel-portal-env.ps1
#
#   $env:VERCEL_TOKEN = "..."; .\scripts\set-vercel-portal-env.ps1

param(
  [string]$RastreameLogin,
  [string]$RastreameSenha,
  [string]$PedagioLogin,
  [string]$PedagioSenha,
  [string]$PedagioCaptchaProvider,
  [string]$PedagioCaptchaApiKey,
  [string]$ProjectName = "lanza-locacoes-services",
  [string]$TeamId = "team_TxQccO1Nw52O2cCmyP35wtp",
  [switch]$DryRun,
  [switch]$PrintOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function EnvOrParam($paramVal, $envName) {
  if ($paramVal) { return $paramVal.Trim() }
  $e = [Environment]::GetEnvironmentVariable($envName, "User")
  if ($e) { return $e.Trim() }
  return $null
}

$rl = EnvOrParam $RastreameLogin "RASTREAME_LOGIN"
$rs = EnvOrParam $RastreameSenha "RASTREAME_SENHA"
$pl = EnvOrParam $PedagioLogin "PEDAGIO_DIGITAL_LOGIN"
$ps = EnvOrParam $PedagioSenha "PEDAGIO_DIGITAL_SENHA"
$cp = EnvOrParam $PedagioCaptchaProvider "PEDAGIO_DIGITAL_CAPTCHA_PROVIDER"
$ck = EnvOrParam $PedagioCaptchaApiKey "PEDAGIO_DIGITAL_CAPTCHA_APIKEY"

$nodeArgs = @(
  "scripts/set-vercel-portal-env.mjs",
  "--project=$ProjectName",
  "--team=$TeamId"
)
if ($PrintOnly) { $nodeArgs += "--print-only" }
if ($DryRun) { $nodeArgs += "--dry-run" }
if ($rl) { $nodeArgs += "--rastreame-login=$rl" }
if ($rs) { $nodeArgs += "--rastreame-senha=$rs" }
if ($pl) { $nodeArgs += "--pedagio-login=$pl" }
if ($ps) { $nodeArgs += "--pedagio-senha=$ps" }
if ($cp) { $nodeArgs += "--pedagio-captcha-provider=$cp" }
if ($ck) { $nodeArgs += "--pedagio-captcha-apikey=$ck" }

& node @nodeArgs
exit $LASTEXITCODE
