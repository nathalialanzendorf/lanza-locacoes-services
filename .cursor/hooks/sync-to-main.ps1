# Cursor hook: após sessão do agente, commit + push para main (se houver alterações).
$ErrorActionPreference = "SilentlyContinue"
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $repoRoot ".git"))) { exit 0 }

Set-Location $repoRoot
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "scripts\sync-to-main.ps1")
exit 0
