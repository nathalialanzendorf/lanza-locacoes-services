# @deprecated Use set-rastreame-auth-user-env.ps1 -Token "<jwt>"
# Credenciais não devem ficar em `.env` — apenas em variáveis de ambiente do utilizador.

Write-Error @"
Este script foi descontinuado.

Defina RASTREAME_AUTH nas variáveis de ambiente do utilizador, por exemplo:

  [Environment]::SetEnvironmentVariable('RASTREAME_AUTH', '<token>', 'User')

Ou:

  .\scripts\set-rastreame-auth-user-env.ps1 -Token '<token>'

Remova RASTREAME_AUTH (e login/senha) do ficheiro .env se ainda existirem.
"@

exit 1
