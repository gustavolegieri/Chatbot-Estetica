# API REST

Base URL: `http://localhost:3000/api`

Todas as rotas (exceto login e webhook) exigem cookie de sessão `estetica_session`.

## Autenticação

### POST /api/auth/login
```json
{ "email": "admin@estetica.com", "password": "admin123" }
```

### POST /api/auth/logout
Encerra a sessão.

### GET /api/auth/me
Retorna usuário autenticado.

---

## Dashboard

### GET /api/dashboard
Retorna estatísticas e agendamentos recentes.

---

## Clientes

### GET /api/clientes?search=
Lista clientes. Parâmetro `search` opcional.

### POST /api/clientes
```json
{
  "name": "João Silva",
  "phone": "11999999999",
  "email": "joao@email.com",
  "vehiclePlate": "ABC1D23",
  "vehicleModel": "Honda Civic"
}
```

### GET /api/clientes/:id
Detalhes com histórico de agendamentos.

### PUT /api/clientes/:id
Atualiza cliente.

### DELETE /api/clientes/:id
Remove cliente.

---

## Serviços

### GET /api/servicos?active=true
Lista serviços.

### POST /api/servicos
```json
{
  "name": "Polimento",
  "description": "Polimento profissional",
  "price": 299.90,
  "durationMin": 180,
  "active": true
}
```

### PUT /api/servicos/:id
### DELETE /api/servicos/:id (desativa)

---

## Agendamentos

### GET /api/agendamentos?date=2026-06-01&status=CONFIRMED
### POST /api/agendamentos
```json
{
  "clientId": "cuid",
  "serviceId": "cuid",
  "date": "2026-06-15",
  "startTime": "09:00",
  "status": "CONFIRMED"
}
```

### GET /api/agendamentos/slots?date=2026-06-15&serviceId=cuid
Retorna horários disponíveis.

### PUT /api/agendamentos/:id
### DELETE /api/agendamentos/:id (cancela)

---

## Financeiro

### GET /api/financeiro?month=2026-06&type=INCOME
### POST /api/financeiro
```json
{
  "type": "EXPENSE",
  "category": "SUPPLIES",
  "amount": 150.00,
  "description": "Produtos de limpeza"
}
```

### DELETE /api/financeiro/:id

---

## Configurações

### GET /api/configuracoes
### PUT /api/configuracoes

---

## WhatsApp

### GET /api/whatsapp/webhook
Health check do webhook.

### POST /api/whatsapp/webhook
Recebe eventos da Evolution API (`messages.upsert`).

## Códigos de resposta

| Código | Significado |
|--------|-------------|
| 200 | Sucesso |
| 201 | Criado |
| 400 | Dados inválidos |
| 401 | Não autenticado |
| 404 | Não encontrado |
| 500 | Erro interno |

## Formato de resposta

```json
{
  "success": true,
  "data": { ... }
}
```

```json
{
  "success": false,
  "error": "Mensagem de erro"
}
```
