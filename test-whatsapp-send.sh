#!/bin/bash

# Script para testar envio de mensagem para o WhatsApp
# Substitua pelo seu número real

curl -X POST http://localhost:3000/api/admin/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511972851072",
    "text": "agendar",
    "pushName": "Teste"
  }'