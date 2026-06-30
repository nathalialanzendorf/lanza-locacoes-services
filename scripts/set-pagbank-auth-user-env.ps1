# Grava PAGBANK_AUTH (e opcionalmente PAGBANK_COOKIE) nas variáveis de ambiente
# persistentes do utilizador (Windows). Não use `.env` para credenciais.
#
# Uso (PowerShell):
#   .\scripts\set-pagbank-auth-user-env.ps1 -Token "<authorization do DevTools>"
#   .\scripts\set-pagbank-auth-user-env.ps1 -Token "<token>" -Cookie "<cookie header>"
#
# Depois: feche e reabra terminais (ou reinicie o Cursor).

param(
  [Parameter(Mandatory = $true)]
  [string]$Token,
  [string]$Cookie
)

$ErrorActionPreference = "Stop"
$val = $Token.Trim()
if (-not $val) {
  Write-Error "Token vazio."
  exit 1
}

[Environment]::SetEnvironmentVariable("PAGBANK_AUTH", $val, "User")
Write-Host "OK: PAGBANK_AUTH gravado nas variaveis de ambiente do utilizador."

if ($Cookie) {
  $ck = $Cookie.Trim()
  if ($ck) {
    [Environment]::SetEnvironmentVariable("PAGBANK_COOKIE", $ck, "User")
    Write-Host "OK: PAGBANK_COOKIE gravado nas variaveis de ambiente do utilizador."
  }
}

Write-Host "    Feche e reabra os terminais (ou o Cursor) para aplicar."
