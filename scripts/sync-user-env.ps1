# Copia variaveis de ambiente do utilizador (User) para a sessao atual (Process)
# quando ainda nao estao definidas — evita reabrir o terminal apos set-*-user-env.ps1.

function Sync-UserEnvToProcess {
  $forceFromUser = @(
    'PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE',
    'LANZA_DB_BACKEND', 'AWS_REGION', 'AWS_ROLE_ARN'
  )
  $procPgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'Process')
  $processHasIamToken =
    -not [string]::IsNullOrEmpty($procPgPassword) -and
    ($procPgPassword -match 'X-Amz-Algorithm|Action=connect')
  foreach ($entry in [Environment]::GetEnvironmentVariables('User').GetEnumerator()) {
    if ($entry.Key -eq 'PGPASSWORD' -and $processHasIamToken) { continue }
    $proc = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
    $force = $forceFromUser -contains $entry.Key
    if (($force -or [string]::IsNullOrEmpty($proc)) -and -not [string]::IsNullOrEmpty($entry.Value)) {
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
