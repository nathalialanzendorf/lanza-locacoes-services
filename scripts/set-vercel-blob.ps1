# Cria Blob store na Vercel e liga ao projeto API.
# Uso:
#   $env:VERCEL_TOKEN = "..."; .\scripts\set-vercel-blob.ps1
#   npx vercel login; .\scripts\set-vercel-blob.ps1

param(
  [string]$StoreName = "lanza-docs",
  [string]$ProjectName = "lanza-locacoes-services",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$args = @("--name=$StoreName", "--project=$ProjectName")
if ($DryRun) { $args += "--dry-run" }
node (Join-Path $root "scripts\set-vercel-blob.mjs") @args
