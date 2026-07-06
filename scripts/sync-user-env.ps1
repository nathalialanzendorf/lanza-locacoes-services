# Copia variaveis de ambiente do utilizador (User) para a sessao atual (Process)
# quando ainda nao estao definidas — evita reabrir o terminal apos set-*-user-env.ps1.

function Sync-UserEnvToProcess {
  foreach ($entry in [Environment]::GetEnvironmentVariables('User').GetEnumerator()) {
    $proc = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
    if ([string]::IsNullOrEmpty($proc) -and -not [string]::IsNullOrEmpty($entry.Value)) {
      Set-Item -Path "env:$($entry.Key)" -Value $entry.Value
    }
  }
}

function Set-ProcessEnv([string]$Name, [string]$Value) {
  if ($null -ne $Value -and $Value.Trim() -ne '') {
    Set-Item -Path "env:$Name" -Value $Value.Trim()
  } else {
    Remove-Item "env:$Name" -ErrorAction SilentlyContinue
  }
}
