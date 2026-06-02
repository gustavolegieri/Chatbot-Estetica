# Sobe o ambiente local para webhook WhatsApp (sem ngrok).
# A Evolution no Docker chama o Next.js em host.docker.internal:3000

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Get-EnvValue {
  param([string]$Name, [string]$Raw)
  if ($Raw -match "${Name}=""([^""]+)""") { return $Matches[1] }
  if ($Raw -match "${Name}=([^\r\n]+)") { return $Matches[1].Trim('"').Trim() }
  return $null
}

Write-Host "Verificando Docker..." -ForegroundColor Cyan
docker compose up -d postgres evolution-api redis | Out-Null

Write-Host "Aguardando Evolution API (ate 60s)..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 12; $i++) {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:8080" -TimeoutSec 5
    if ($r.status -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep 5
}
if (-not $ready) { throw "Evolution API nao respondeu em http://127.0.0.1:8080" }

$envFile = Get-Content ".env" -Raw
$apiKey = Get-EnvValue -Name "EVOLUTION_API_KEY" -Raw $envFile
$instance = Get-EnvValue -Name "EVOLUTION_INSTANCE_NAME" -Raw $envFile
if (-not $apiKey) { throw "EVOLUTION_API_KEY nao encontrada no .env" }
if (-not $instance) { $instance = "estetica" }

$headers = @{ apikey = $apiKey }

# Cria instancia se ainda nao existir (ex.: volume novo ou container recriado)
$instances = @()
try {
  $fetched = Invoke-RestMethod -Uri "http://127.0.0.1:8080/instance/fetchInstances" -Headers $headers -TimeoutSec 15
  if ($null -ne $fetched) { $instances = @($fetched) }
} catch {}

$exists = $instances | Where-Object {
  ($_.name -eq $instance) -or ($_.instanceName -eq $instance)
}

if (-not $exists) {
  Write-Host "Instancia '$instance' nao existe. Criando..." -ForegroundColor Yellow
  $createBody = @{
    instanceName  = $instance
    qrcode        = $true
    integration   = "WHATSAPP-BAILEYS"
    groupsIgnore  = $true
  } | ConvertTo-Json
  try {
    Invoke-RestMethod -Method POST `
      -Uri "http://127.0.0.1:8080/instance/create" `
      -Headers $headers `
      -ContentType "application/json" `
      -Body $createBody | Out-Null
    Write-Host "Instancia criada." -ForegroundColor Green
    Write-Host "Conecte o WhatsApp: http://127.0.0.1:8080/manager (instancia $instance -> QR Code)" -ForegroundColor Yellow
  } catch {
    $msg = $_.ErrorDetails.Message
    if ($msg -and $msg -match "already in use|already exists") {
      Write-Host "Instancia ja existe (ignorando)." -ForegroundColor DarkYellow
    } else {
      throw
    }
  }
}

$webhookUrl = "http://host.docker.internal:3000/api/whatsapp/webhook"
$body = @{
  webhook = @{
    enabled         = $true
    url             = $webhookUrl
    webhookByEvents = $false
    events          = @("MESSAGES_UPSERT")
  }
} | ConvertTo-Json -Depth 5

Write-Host "Configurando webhook: $webhookUrl" -ForegroundColor Cyan
Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:8080/webhook/set/$instance" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body | Out-Null

Write-Host "Webhook configurado." -ForegroundColor Green

# Ignora mensagens de grupos na Evolution (nao dispara webhook de grupo)
try {
  $settingsBody = @{
    rejectCall      = $false
    msgCall         = ""
    groupsIgnore    = $true
    alwaysOnline    = $false
    readMessages    = $false
    readStatus      = $false
    syncFullHistory = $false
  } | ConvertTo-Json
  Invoke-RestMethod -Method POST `
    -Uri "http://127.0.0.1:8080/settings/set/$instance" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $settingsBody | Out-Null
  Write-Host "Grupos ignorados na instancia (groupsIgnore=true)." -ForegroundColor Green
} catch {
  Write-Host "Aviso: nao foi possivel ativar groupsIgnore (pode ignorar se ja estiver ativo)." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "Proximo passo: em outro terminal rode  npm run dev" -ForegroundColor Yellow
Write-Host "Depois envie 'oi' no WhatsApp conectado na instancia $instance." -ForegroundColor Yellow
