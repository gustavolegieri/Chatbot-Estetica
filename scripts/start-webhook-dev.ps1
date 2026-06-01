# Sobe o ambiente local para webhook WhatsApp (sem ngrok).
# A Evolution no Docker chama o Next.js em host.docker.internal:3000

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

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

# Carrega EVOLUTION_API_KEY do .env
$envFile = Get-Content ".env" -Raw
if ($envFile -match 'EVOLUTION_API_KEY="([^"]+)"') { $apiKey = $Matches[1] }
elseif ($envFile -match "EVOLUTION_API_KEY=([^\r\n]+)") { $apiKey = $Matches[1].Trim('"') }
else { throw "EVOLUTION_API_KEY nao encontrada no .env" }

$webhookUrl = "http://host.docker.internal:3000/api/whatsapp/webhook"
$body = @{
  webhook = @{
    enabled = $true
    url = $webhookUrl
    webhookByEvents = $false
    events = @("MESSAGES_UPSERT")
  }
} | ConvertTo-Json -Depth 5

Write-Host "Configurando webhook: $webhookUrl" -ForegroundColor Cyan
Invoke-RestMethod -Method POST `
  -Uri "http://127.0.0.1:8080/webhook/set/estetica" `
  -Headers @{ apikey = $apiKey } `
  -ContentType "application/json" `
  -Body $body | Out-Null

Write-Host "Webhook configurado." -ForegroundColor Green
Write-Host ""
Write-Host "Proximo passo: em outro terminal rode  npm run dev" -ForegroundColor Yellow
Write-Host "Depois envie 'oi' no WhatsApp conectado na instancia estetica." -ForegroundColor Yellow
