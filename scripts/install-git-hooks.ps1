# Copia hooks versionados para .git/hooks/
# Uso: .\scripts\install-git-hooks.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$gitDir = git rev-parse --git-dir
if (-not $gitDir) {
  Write-Error "Não é um repositório git."
  exit 1
}

$dest = Join-Path $gitDir "hooks"
$src = Join-Path $PSScriptRoot "git-hooks"
if (-not (Test-Path $src)) {
  Write-Error "Pasta não encontrada: $src"
  exit 1
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Get-ChildItem $src -File | ForEach-Object {
  Copy-Item $_.FullName (Join-Path $dest $_.Name) -Force
  Write-Host "Instalado: hooks/$($_.Name)"
}

Write-Host ""
Write-Host "Hooks instalados. Em main, cada commit dispara push para origin/main."
Write-Host "Sync manual: npm run sync:main"
