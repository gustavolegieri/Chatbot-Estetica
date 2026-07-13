# CRON Job Configuration

## Como configurar o CRON job no Vercel

### Opção 1: Via Vercel Dashboard (Recomendado)

1. Acesse [vercel.com](https://vercel.com)
2. Selecione seu projeto
3. Vá em **Settings → Cron Jobs**
4. Clique em **Add Cron Job**
5. Configure:
   - **Job Name:** `reminders`
   - **Cron Expression:** `*/5 * * * *` (a cada 5 minutos)
   - **URL:** `https://seu-projeto.vercel.app/api/cron/reminders?secret=g7K9xP2mN4Qv8Rz1`
6. Clique em **Save**

### Opção 2: Via vercel.json

O arquivo `vercel.json` já está configurado no projeto com:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

Ao fazer deploy, o Vercel irá criar automaticamente o cron job.

## Cron Expressions Comuns

- `*/5 * * * *` - A cada 5 minutos
- `0 * * * *` - A cada hora
- `0 */6 * * *` - A cada 6 horas
- `0 0 * * *` - Uma vez por dia (meia-noite)
- `0 9 * * *` - Todos os dias às 9h

## Variáveis de Ambiente

Certifique-se de que estas variáveis estão configuradas no Vercel:

- `CRON_SECRET=g7K9xP2mN4Qv8Rz1` (já configurado no .env)
- `DATABASE_URL` (já configurado)
- `WASENDER_API_KEY` (já configurado)

## Testar Localmente

Para testar o cron job localmente:

```bash
curl "http://localhost:3000/api/cron/reminders?secret=g7K9xP2mN4Qv8Rz1"
```

## O que o CRON faz

O cron job `/api/cron/reminders`:
- Envia lembretes customizados (30min, 1h, 1dia) baseados na preferência do usuário
- Envia lembrete padrão de 4h para todos
- Envia aviso de confirmação 30min antes
- Cancela automaticamente se não houver confirmação
