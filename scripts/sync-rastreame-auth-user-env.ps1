# Lê RASTREAME_AUTH do ficheiro .env na raiz do repo e grava na variável de ambiente
# do *utilizador* no Windows (persistente após fechar o terminal).
# Uso (PowerShell): cd <raiz do repo>; .\scripts\sync-rastreame-auth-user-env.ps1
# Depois: fechar e reabrir terminais (ou reiniciar o Cursor) para o novo valor aparecer.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"
if (-not (Test-Path $envFile)) {
  Write-Error "Ficheiro .env não encontrado em: $envFile (crie a partir de .env.example)."
  exit 1
}

$found = $false
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  if ($line -match '^\s*RASTREAME_AUTH\s*=\s*(.+)\s*$') {
    $val = $Matches[1].Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    if (-not $val) {
      Write-Error "RASTREAME_AUTH está vazio em .env."
      exit 1
    }
    [Environment]::SetEnvironmentVariable("RASTREAME_AUTH", $val, "User")
    Write-Host "OK: RASTREAME_AUTH gravado nas variaveis de ambiente do utilizador."
    Write-Host "    Feche e reabra os terminais (ou o Cursor) para aplicar."
    $found = $true
  }
}

if (-not $found) {
  Write-Error "Linha RASTREAME_AUTH=... não encontrada em .env."
  exit 1
}
