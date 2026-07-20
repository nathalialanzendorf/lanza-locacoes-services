# Configura AWS CLI para token IAM RDS (conta Lanza, us-east-1).
#
# Pré-requisito: credenciais AWS com permissão rds-db:connect no cluster RDS.
# NÃO use AWS_ROLE_ARN da Vercel localmente — essa role é só OIDC na Vercel.
#
# Uso:
#   .\scripts\configure-aws-cli.ps1                    # guia interactivo
#   .\scripts\configure-aws-cli.ps1 -AccessKey "AKIA..." -SecretKey "..." 
#   .\scripts\configure-aws-cli.ps1 -Profile lanza
#
# Depois:
#   .\scripts\set-postgres-user-env.ps1 -UseIam
#   .\scripts\postgres-aws-check.ps1

param(
  [string]$Profile = "default",
  [string]$AccessKey = "",
  [string]$SecretKey = "",
  [string]$Region = "us-east-1",
  [switch]$SkipCheck
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
  Write-Host "AWS CLI nao instalada." -ForegroundColor Red
  Write-Host "Instale: https://aws.amazon.com/cli/" -ForegroundColor Yellow
  exit 1
}

Write-Host "AWS CLI: $(aws --version 2>&1 | Select-Object -First 1)"
Write-Host "Perfil:  $Profile"
Write-Host "Regiao:  $Region"
Write-Host ""

$profileArgs = @()
if ($Profile -and $Profile -ne "default") {
  $profileArgs = @("--profile", $Profile)
}

aws configure set region $Region @profileArgs | Out-Null
aws configure set output json @profileArgs | Out-Null

if ($AccessKey.Trim() -and $SecretKey.Trim()) {
  aws configure set aws_access_key_id $AccessKey.Trim() @profileArgs | Out-Null
  aws configure set aws_secret_access_key $SecretKey.Trim() @profileArgs | Out-Null
  Write-Host "Credenciais gravadas no perfil '$Profile'." -ForegroundColor Green
} else {
  Write-Host @"
Configure credenciais AWS (escolha UMA opcao):

  A) Access keys IAM (utilizador com rds-db:connect):
       aws configure $($profileArgs -join ' ')

     Perguntas:
       AWS Access Key ID:     (AKIA...)
       AWS Secret Access Key: (...)
       Default region:        us-east-1
       Default output:        json

  B) SSO / IAM Identity Center (se a organizacao usar):
       aws configure sso $($profileArgs -join ' ')
       aws sso login $($profileArgs -join ' ')

  C) Credenciais temporarias do console (so token RDS, sem AWS CLI):
       .\scripts\postgres-console-token.ps1 -Check

"@ -ForegroundColor Cyan

  $choice = Read-Host "Executar agora? [A] aws configure  [B] aws configure sso  [N] nada"
  switch ($choice.ToUpper()) {
    "A" {
      aws configure @profileArgs
    }
    "B" {
      aws configure sso @profileArgs
      aws sso login @profileArgs
    }
    default {
      Write-Host "Nenhuma credencial gravada. Volte quando tiver access keys ou SSO." -ForegroundColor Yellow
      exit 0
    }
  }
}

Write-Host ""
Write-Host "A testar identidade AWS..."
try {
  $id = aws sts get-caller-identity @profileArgs | ConvertFrom-Json
  Write-Host ("  Account: {0}" -f $id.Account) -ForegroundColor Green
  Write-Host ("  Arn:     {0}" -f $id.Arn)
} catch {
  Write-Host "  Falhou: credenciais invalidas ou expiradas." -ForegroundColor Red
  exit 1
}

if ($Profile -ne "default") {
  $env:AWS_PROFILE = $Profile
  [Environment]::SetEnvironmentVariable("AWS_PROFILE", $Profile, "User")
  Write-Host "  AWS_PROFILE=$Profile (gravado no utilizador)"
}

Write-Host ""
Write-Host "A gravar variaveis Postgres (modo IAM)..."
& (Join-Path $PSScriptRoot "set-postgres-user-env.ps1") -UseIam

if ($SkipCheck) {
  Write-Host "OK (verificacao RDS ignorada)." -ForegroundColor Green
  exit 0
}

Write-Host ""
& (Join-Path $PSScriptRoot "postgres-aws-check.ps1")
exit $LASTEXITCODE
