# Grava RASTREAME_AUTH nas variáveis de ambiente persistentes do utilizador (Windows).
# Não use `.env` para credenciais.
#
# Uso (PowerShell):
#   .\scripts\set-rastreame-auth-user-env.ps1 -Token "<jwt do DevTools x-r2f-auth>"
#
# Depois: feche e reabra terminais (ou reinicie o Cursor).

param(
  [Parameter(Mandatory = $true)]
  [string]$Token
)

$ErrorActionPreference = "Stop"
$val = $Token.Trim()
if (-not $val) {
  Write-Error "Token vazio."
  exit 1
}

[Environment]::SetEnvironmentVariable("RASTREAME_AUTH", $val, "User")
Write-Host "OK: RASTREAME_AUTH gravado nas variaveis de ambiente do utilizador."
Write-Host "    Feche e reabra os terminais (ou o Cursor) para aplicar."
