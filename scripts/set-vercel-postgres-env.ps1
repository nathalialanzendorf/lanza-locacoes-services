# Grava variaveis PostgreSQL/RDS no projeto Vercel da API.
# Wrapper PowerShell -> scripts/set-vercel-postgres-env.mjs (REST API, sem npx vercel).
#
# Uso:
#   .\scripts\set-vercel-postgres-env.ps1
#   .\scripts\set-vercel-postgres-env.ps1 -PrintOnly
#   $env:VERCEL_TOKEN = "..."; .\scripts\set-vercel-postgres-env.ps1

param(
  [ValidateSet("postgres", "dual", "file")]
  [string]$Backend = "postgres",
  [string]$ProjectName = "lanza-locacoes-services",
  [string]$TeamId = "team_TxQccO1Nw52O2cCmyP35wtp",
  [switch]$DryRun,
  [switch]$PrintOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$nodeArgs = @(
  "scripts/set-vercel-postgres-env.mjs",
  "--backend=$Backend",
  "--project=$ProjectName",
  "--team=$TeamId"
)
if ($PrintOnly) { $nodeArgs += "--print-only" }
if ($DryRun) { $nodeArgs += "--dry-run" }

& node @nodeArgs
exit $LASTEXITCODE
