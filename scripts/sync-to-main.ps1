# Commit (se houver alterações) e push para origin/main.
# Uso:
#   .\scripts\sync-to-main.ps1
#   .\scripts\sync-to-main.ps1 -Message "multas: cadastro MLN-0B87"
#   .\scripts\sync-to-main.ps1 -PushOnly
#
# Requer branch main e remote origin.

param(
  [string]$Message = "",
  [switch]$PushOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Invoke-Git {
  param([string[]]$Args)
  & git @Args
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Args -join ' ') falhou (exit $LASTEXITCODE)"
  }
}

$branch = (git symbolic-ref --short HEAD 2>$null)
if ($branch -ne "main") {
  Write-Error "Sync abortado: branch atual é '$branch'. Mude para main (git checkout main)."
  exit 1
}

Write-Host "git fetch origin main..."
Invoke-Git @("fetch", "origin", "main")

if (-not $PushOnly) {
  Invoke-Git @("add", "-A")
  $porcelain = git status --porcelain
  if ($porcelain) {
    if (-not $Message) {
      $Message = "sync: atualizacao automatica $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
    Invoke-Git @("commit", "-m", $Message)
    Write-Host "Commit criado: $Message"
  } else {
    Write-Host "Nada a commitar."
  }
}

$localHead = git rev-parse HEAD
$remoteHead = git rev-parse "origin/main" 2>$null
if ($LASTEXITCODE -eq 0 -and $localHead -eq $remoteHead) {
  Write-Host "main já está em dia com origin/main."
  exit 0
}

Write-Host "git pull --rebase origin main..."
Invoke-Git @("pull", "--rebase", "origin", "main")

Write-Host "git push origin main..."
Invoke-Git @("push", "origin", "main")

Write-Host "OK: origin/main atualizado."
