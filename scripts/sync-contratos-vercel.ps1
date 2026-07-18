$base = "https://api.lanzalocacoes.vercel.app"
$ErrorActionPreference = "Stop"

function Get-Api($path) {
  return Invoke-RestMethod -Uri "$base$path" -TimeoutSec 90 -Method Get
}

function Invoke-Api($method, $path, $body = $null, $headers = @{}) {
  $params = @{
    Uri         = "$base$path"
    TimeoutSec  = 120
    Method      = $method
    ContentType = "application/json"
    Headers     = $headers
  }
  if ($null -ne $body) {
    $params.Body = ($body | ConvertTo-Json -Depth 8)
  }
  return Invoke-RestMethod @params
}

function Post-Api($path, $body, $headers = @{}) {
  return Invoke-Api "Post" $path $body $headers
}

function Patch-Api($path, $body, $headers = @{}) {
  return Invoke-Api "Patch" $path $body $headers
}

$vitor = Get-Api "/api/contratos?placa=MLX-2H34"
$rafaela = Get-Api "/api/contratos?placa=PWH-3A45"

Write-Host "=== Vitor MLX (Postgres) ==="
$vitor.items | Select-Object id, clienteNome, status, dataEncerramento, dataFimPrevista, prazoDias | Format-Table -AutoSize

Write-Host "=== Rafaela PWH (Postgres) ==="
$rafaela.items | Where-Object { $_.status -eq "ativo" } | Select-Object id, clienteNome, status, dataInicio, dataFimPrevista, prazoDias | Format-Table -AutoSize

$ativo = $vitor.items | Where-Object { $_.status -eq "ativo" -and $_.placa -eq "MLX-2H34" } | Select-Object -First 1
if ($ativo) {
  Write-Host "Encerrando Vitor na API..."
  $enc = Post-Api "/api/contratos/encerrar" @{
    idOuPasta = $ativo.id
    dataEncerramento = "20/06/2026"
    motivoEncerramento = "devolvido"
    quebraContrato = $true
  }
  Write-Host "OK encerramento:" ($enc.data.contrato.status) ($enc.data.contrato.dataEncerramento)
} else {
  Write-Host "Vitor MLX-2H34: sem contrato ativo no Postgres (ja encerrado?)."
}

$rafaelaAtiva = $rafaela.items | Where-Object { $_.status -eq "ativo" -and $_.placa -eq "PWH-3A45" } | Select-Object -First 1
if ($rafaelaAtiva -and ($rafaelaAtiva.dataFimPrevista -ne "13/11/2026" -or $rafaelaAtiva.prazoDias -ne 365)) {
  Write-Host "Atualizando Rafaela 1 ano na API..."
  try {
    $patch = Patch-Api "/api/contratos/$($rafaelaAtiva.id)" @{
      dataFimPrevista = "13/11/2026"
      prazoDias = 365
    }
    Write-Host "OK Rafaela:" ($patch.data.contrato.dataFimPrevista) ($patch.data.contrato.prazoDias)
  } catch {
    Write-Host "PATCH ainda indisponivel (aguardar deploy):" $_.Exception.Message
  }
}

$rafaela2 = Get-Api '/api/contratos?placa=PWH-3A45&status=ativo'
Write-Host '=== Rafaela apos operacao ==='
$rafaela2.items | Select-Object dataInicio, dataFimPrevista, prazoDias | Format-Table -AutoSize
