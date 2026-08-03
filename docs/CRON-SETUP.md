# CRON Job Configuration

## Como configurar o CRON job no Vercel

### ⚠️ Limitação do Plano Hobby

No plano **Hobby** do Vercel, cron jobs só podem rodar **uma vez por dia**. Se precisar de execução mais frequente, faça upgrade para o plano **Pro**.

### Opção 1: cron-job.org (gratuito e recomendado no Vercel Hobby)

O plano Hobby da Vercel não executa crons frequentes. Crie uma conta gratuita em
`https://cron-job.org` e configure uma chamada a cada 5 minutos:

- Nome: `Garagem do Ka — lembretes`
- URL: `https://SEU-DOMINIO/api/cron/reminders`
- Frequência: a cada 5 minutos
- Método: `GET`
- Header: `Authorization: Bearer SEU_CRON_SECRET`

Opcionalmente crie outra tarefa para `/api/cron/followup` a cada 10 minutos.

O segredo deve ser o mesmo `CRON_SECRET` configurado na Vercel. Não coloque o
segredo real em arquivos versionados ou mensagens públicas.

### Por que não usar cron frequente da Vercel no Hobby?

A Vercel Hobby aceita apenas execução diária, sem precisão suficiente para um
lembrete de confirmação duas horas antes. Um cron mais frequente no
`vercel.json` pode impedir o deploy. O agendador HTTP externo resolve isso sem
alterar o plano da Vercel.

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
- Envia confirmação padrão cerca de 2h antes para todos
- Envia aviso de confirmação 30min antes
- Cancela automaticamente se não houver confirmação
