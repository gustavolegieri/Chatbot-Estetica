# CRON Job Configuration

## Como configurar o CRON job no Vercel

### ⚠️ Limitação do Plano Hobby

No plano **Hobby** do Vercel, cron jobs só podem rodar **uma vez por dia**. Se precisar de execução mais frequente, faça upgrade para o plano **Pro**.

### Opção 1: Via Vercel Dashboard (Recomendado)

1. Acesse [vercel.com](https://vercel.com)
2. Selecione seu projeto
3. Vá em **Settings → Cron Jobs**
4. Clique em **Add Cron Job** para cada job:

**Job 1 - Reminders:**
   - **Job Name:** `reminders`
   - **Cron Expression:** `0 9 * * *` (todos os dias às 9h)
   - **URL:** `https://seu-projeto.vercel.app/api/cron/reminders?secret=g7K9xP2mN4Qv8Rz1`

**Job 2 - Followup:**
   - **Job Name:** `followup`
   - **Cron Expression:** `0 10 * * *` (todos os dias às 10h)
   - **URL:** `https://seu-projeto.vercel.app/api/cron/followup?secret=g7K9xP2mN4Qv8Rz1`

5. Clique em **Save** para cada job

### Usando cronjob.org

Se você usa `cronjob.org`, configure uma tarefa para chamar:

- `https://seu-projeto.vercel.app/api/cron/process-message-queue?secret=g7K9xP2mN4Qv8Rz1`
- `https://seu-projeto.vercel.app/api/cron/reminders?secret=g7K9xP2mN4Qv8Rz1`

Recomendo intervalos de:

- `process-message-queue`: a cada 1-2 minutos
- `reminders`: a cada 5-10 minutos

Isso mantém o Hobby funcionando como se tivesse cron frequente. 

### Opção 2: Via vercel.json

O arquivo `vercel.json` já está configurado no projeto com:

```json
{
  "crons": [
    {
      "path": "/api/cron/reminders",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/followup",
      "schedule": "0 10 * * *"
    }
  ]
}
```

Ao fazer deploy, o Vercel irá criar automaticamente os cron jobs.

## Cron Expressions Comuns

### Plano Hobby (apenas diário):
- `0 0 * * *` - Uma vez por dia (meia-noite)
- `0 9 * * *` - Todos os dias às 9h
- `0 18 * * *` - Todos os dias às 18h

### Plano Pro (frequência permitida):
- `*/5 * * * *` - A cada 5 minutos
- `0 * * * *` - A cada hora
- `0 */6 * * *` - A cada 6 horas
- `0 0 * * *` - Uma vez por dia (meia-noite)

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
