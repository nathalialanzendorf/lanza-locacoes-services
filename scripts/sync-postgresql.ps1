# Espelha database/*.json no PostgreSQL (RDS).
# Uso:
#   .\scripts\sync-postgresql.ps1
#   .\scripts\sync-postgresql.ps1 cliente-despesas.json
#   .\scripts\sync-postgresql.ps1 --dry-run
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'sync-user-env.ps1')
Sync-UserEnvToProcess
& (Join-Path $PSScriptRoot 'lanza.ps1') sync-postgresql @args
exit $LASTEXITCODE
