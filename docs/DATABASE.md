# Banco de Dados

## Diagrama de Entidades

```
User ────────────── FinancialRecord
                         │
Client ─── Appointment ──┤
              │          │
           Service ──────┘

Settings (singleton)
WhatsAppSession ─── Client
```

## Tabelas

### User
Usuários do painel administrativo.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | String | ID único (cuid) |
| email | String | E-mail único |
| name | String | Nome completo |
| password | String | Hash bcrypt |
| role | Enum | ADMIN ou OPERATOR |
| active | Boolean | Conta ativa |

### Client
Clientes da estética.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| phone | String | Telefone único (WhatsApp) |
| vehiclePlate | String? | Placa do veículo |
| vehicleModel | String? | Modelo do veículo |

### Service
Serviços oferecidos.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| price | Decimal | Preço em R$ |
| durationMin | Int | Duração em minutos |
| active | Boolean | Disponível para agendamento |

### Appointment
Agendamentos de serviços.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| date | DateTime | Data do agendamento |
| startTime | String | Horário início (HH:mm) |
| endTime | String | Horário fim (HH:mm) |
| status | Enum | PENDING, CONFIRMED, etc. |
| source | String | admin ou whatsapp |

### FinancialRecord
Lançamentos financeiros.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| type | Enum | INCOME ou EXPENSE |
| category | Enum | SERVICE, RENT, etc. |
| amount | Decimal | Valor |

### Settings
Configurações globais (registro único `id: "default"`).

### WhatsAppSession
Estado da conversa do bot por telefone.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| step | Enum | Etapa atual do fluxo |
| selectedServiceId | String? | Serviço escolhido |
| selectedDate | String? | Data escolhida (yyyy-MM-dd) |
| selectedTime | String? | Horário escolhido |

## Comandos úteis

```bash
# Aplicar schema
npx prisma db push

# Criar migration
npx prisma migrate dev --name init

# Visualizar dados
npx prisma studio

# Reset completo (cuidado!)
npx prisma migrate reset
```
