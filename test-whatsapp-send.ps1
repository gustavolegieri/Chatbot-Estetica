# Script PowerShell para testar envio de mensagem para o WhatsApp
# Substitua pelo seu número real

# Para testar agendamento (com calendário)
$body = @{
    phone = "5511972851072"
    text = "agendar"
    pushName = "Teste"
} | ConvertTo-Json

# Para testar outras mensagens, descomente abaixo:
# $body = @{
#     phone = "5511972851072"
#     text = "menu"
#     pushName = "Teste"
# } | ConvertTo-Json

Write-Host "Enviando mensagem de teste..." -ForegroundColor Green
Write-Host "Para: 5511972851072" -ForegroundColor Yellow
Write-Host "Texto: agendar" -ForegroundColor Yellow
Write-Host ""

try {
    $result = Invoke-RestMethod -Uri "http://localhost:3000/api/admin/test-webhook" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -ErrorAction Stop

    Write-Host "Resultado:" -ForegroundColor Cyan
    $result | ConvertTo-Json
} catch {
    Write-Host "Erro ao enviar mensagem:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Verifique se o servidor está rodando (npm run dev)" -ForegroundColor Yellow
}