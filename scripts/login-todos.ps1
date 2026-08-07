# Executa sequencialmente todos os scripts de login assistido (Chrome CDP).
# Cada portal exige interacao manual (certificado, captcha, etc.).
#
#   .\scripts\login-todos.ps1
#   .\scripts\login-todos.ps1 -RastreameLogin "email" -RastreameSenha "senha" -PedagioCpf "cpf" -PedagioSenha "senha"
#   .\scripts\login-todos.ps1 -SkipDetranSc -SkipDetranRs
#   .\scripts\login-todos.ps1 -SomenteVercel   # so envia credenciais Rastreame/Pedagio para a Vercel
#   .\scripts\login-todos.ps1 -Vercel          # login local + envia credenciais para a Vercel
#
# Credenciais ficam no env do utilizador Windows (nao no Git).

param(
  [string]$RastreameLogin,
  [string]$RastreameSenha,
  [string]$PedagioCpf,
  [string]$PedagioSenha,
  [string]$PedagioCaptchaProvider,
  [string]$PedagioCaptchaApiKey,
  [string]$DetranRsPfx,
  [string]$DetranRsPfxPass,
  [string]$DetranScPfx,
  [string]$DetranScPfxPass,
  [string]$DetranScUrl,
  [switch]$Fresh,
  [switch]$ContinueOnError,
  [switch]$SkipDetranSc,
  [switch]$SkipDetranRs,
  [switch]$SkipPedagio,
  [switch]$SkipSigapay,
  [switch]$SkipRastreame,
  [switch]$Vercel,
  [switch]$SomenteVercel
)

$ErrorActionPreference = "Stop"
$scriptsDir = $PSScriptRoot

function Invoke-Step {
  param(
    [string]$Name,
    [scriptblock]$Action
  )
  Write-Host ""
  Write-Host "========================================"
  Write-Host " $Name"
  Write-Host "========================================"
  Write-Host ""
  try {
    & $Action
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
      throw "Exit code $LASTEXITCODE"
    }
    Write-Host ""
    Write-Host "OK: $Name"
    return $true
  } catch {
    Write-Host ""
    Write-Warning "Falhou: $Name - $($_.Exception.Message)"
    if (-not $ContinueOnError) {
      Write-Error "Interrompido. Use -ContinueOnError para seguir aos proximos portais."
      exit 1
    }
    return $false
  }
}

if ($SomenteVercel -or $Vercel) {
  $vercelArgs = @{}
  if ($RastreameLogin) { $vercelArgs.RastreameLogin = $RastreameLogin }
  if ($RastreameSenha) { $vercelArgs.RastreameSenha = $RastreameSenha }
  if ($PedagioCpf) { $vercelArgs.PedagioLogin = $PedagioCpf }
  if ($PedagioSenha) { $vercelArgs.PedagioSenha = $PedagioSenha }
  if ($PedagioCaptchaProvider) { $vercelArgs.PedagioCaptchaProvider = $PedagioCaptchaProvider }
  if ($PedagioCaptchaApiKey) { $vercelArgs.PedagioCaptchaApiKey = $PedagioCaptchaApiKey }

  Invoke-Step "Vercel - credenciais Rastreame/Pedagio" {
    & (Join-Path $scriptsDir "set-vercel-portal-env.ps1") @vercelArgs
  } | Out-Null

  if ($SomenteVercel) {
    Write-Host ""
    Write-Host "Concluido (somente Vercel)."
    exit 0
  }
}

$steps = @()

if (-not $SkipDetranSc) {
  $steps += @{
    Name = "DETRAN SC"
    Action = {
      $a = @{}
      if ($Fresh) { $a.Fresh = $true }
      if ($DetranScPfx) { $a.Pfx = $DetranScPfx }
      if ($DetranScPfxPass) { $a.PfxPass = $DetranScPfxPass }
      if ($DetranScUrl) { $a.Url = $DetranScUrl }
      & (Join-Path $scriptsDir "login-detran-sc.ps1") @a
    }
  }
}

if (-not $SkipDetranRs) {
  $steps += @{
    Name = "DETRAN RS"
    Action = {
      $a = @{}
      if ($Fresh) { $a.Fresh = $true }
      if ($DetranRsPfx) { $a.Pfx = $DetranRsPfx }
      if ($DetranRsPfxPass) { $a.PfxPass = $DetranRsPfxPass }
      & (Join-Path $scriptsDir "login-detran-rs.ps1") @a
    }
  }
}

if (-not $SkipPedagio) {
  $steps += @{
    Name = "Pedagio Digital"
    Action = {
      $a = @{}
      if ($Fresh) { $a.Fresh = $true }
      if ($PedagioCpf) { $a.Cpf = $PedagioCpf }
      if ($PedagioSenha) { $a.Senha = $PedagioSenha }
      & (Join-Path $scriptsDir "login-pedagio.ps1") @a
    }
  }
}

if (-not $SkipSigapay) {
  $steps += @{
    Name = "SigaPay"
    Action = {
      & (Join-Path $scriptsDir "login-sigapay.ps1")
    }
  }
}

if (-not $SkipRastreame) {
  $steps += @{
    Name = "Rastreame"
    Action = {
      $a = @{}
      if ($Fresh) { $a.Fresh = $true }
      if ($RastreameLogin) { $a.Login = $RastreameLogin }
      if ($RastreameSenha) { $a.Senha = $RastreameSenha }
      & (Join-Path $scriptsDir "login-rastreame.ps1") @a
    }
  }
}

Write-Host "Login de portais - $($steps.Count) etapa(s)"
Write-Host "Feche cada janela do Chrome apenas apos concluir login e carregar dados."
Write-Host ""

$ok = 0
$fail = 0
foreach ($step in $steps) {
  if (Invoke-Step $step.Name $step.Action) { $ok++ } else { $fail++ }
}

Write-Host ""
Write-Host "========================================"
Write-Host " Resumo: $ok OK, $fail falha(s)"
Write-Host "========================================"

if ($Vercel -and -not $SomenteVercel) {
  Write-Host ""
  Write-Host "Enviando credenciais Rastreame/Pedagio para a Vercel..."
  $vercelArgs = @{}
  if ($RastreameLogin) { $vercelArgs.RastreameLogin = $RastreameLogin }
  if ($RastreameSenha) { $vercelArgs.RastreameSenha = $RastreameSenha }
  if ($PedagioCpf) { $vercelArgs.PedagioLogin = $PedagioCpf }
  if ($PedagioSenha) { $vercelArgs.PedagioSenha = $PedagioSenha }
  if ($PedagioCaptchaProvider) { $vercelArgs.PedagioCaptchaProvider = $PedagioCaptchaProvider }
  if ($PedagioCaptchaApiKey) { $vercelArgs.PedagioCaptchaApiKey = $PedagioCaptchaApiKey }
  & (Join-Path $scriptsDir "set-vercel-portal-env.ps1") @vercelArgs
}

if ($fail -gt 0 -and -not $ContinueOnError) { exit 1 }
Write-Host ""
Write-Host "Concluido. Reabra terminais/Cursor para ver as novas variaveis de ambiente."
