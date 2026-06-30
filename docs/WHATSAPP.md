# Integração WhatsApp (Evolution API)

## Visão geral

O bot de WhatsApp guia o cliente por um fluxo conversacional para agendar, consultar, cancelar ou reagendar serviços.

## Fluxo do Bot (Garagem do Ka)

Atendente virtual premium com etapas numeradas, anti-flood (debounce ~2,8s) e apenas chats privados.

```
Primeira mensagem → Boas-vindas + pedir nome
Nome → Menu (8 categorias de serviço)
Categoria → Submenu ou serviço direto
Serviço → Agendar / Outros / Dúvida
Veículo (modelo • ano • cor • estado) → Orçamento
Upsell (1x) → Período → Dia → Pagamento → Confirmação
```

**Comandos:** `menu` volta ao menu principal (se o nome já foi informado).

**Interpretação livre:** o cliente pode enviar veículo e serviço na mesma mensagem (ex.: *Hilux preta 2021 com riscos, quero vitrificação*).

**Sessão:** após **30 min** sem resposta (configurável em Configurações → `sessionResetMin`), o bot reinicia e reenvia as boas-vindas.

**Handoff:** ao encerrar atendimento humano no painel, a *próxima mensagem* do cliente recebe boas-vindas + menu principal.

**Confirmação de presença:** responda *CONFIRME* (não use o número `1` do menu). Lembrete 4h e aviso 30min antes do horário — enviados automaticamente pelo bot a cada mensagem recebida (sem depender de cron externo).

**Fora do horário:** mensagens recebidas após o fechamento (ou fora dos dias de funcionamento) recebem aviso automático com horário de retorno.

Arquivos principais: `src/lib/whatsapp-bot.ts`, `whatsapp-flow.ts`, `whatsapp-catalog.ts`, `whatsapp-flow-messages.ts`.

## Configuração da Evolution API

### 1. Variáveis de ambiente

```env
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=sua-api-key
EVOLUTION_INSTANCE_NAME=estetica
NEXT_PUBLIC_APP_URL=https://seu-dominio.com
```

### 2. Criar instância

Consulte a documentação da [Evolution API](https://doc.evolution-api.com/) para criar uma instância e conectar o WhatsApp via QR Code.

### 3. Configurar Webhook

Na instância, configure o webhook:

| Campo | Valor |
|-------|-------|
| URL | `{APP_URL}/api/whatsapp/webhook` |
| Eventos | `messages.upsert` |
| Método | POST |

Exemplo com curl:

```bash
curl -X POST "http://localhost:8080/webhook/set/estetica" \
  -H "apikey: SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://seu-dominio.com/api/whatsapp/webhook",
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

> Em desenvolvimento local, use [ngrok](https://ngrok.com/) para expor `localhost:3000`.

### 4. Painel Admin

Em **Configurações → WhatsApp**, você pode:
- Habilitar/desabilitar o bot
- Personalizar mensagem de boas-vindas
- Salvar credenciais da Evolution API

## Tipos de mensagem enviadas

| Tipo | Uso |
|------|-----|
| `sendButtons` | Menu principal, confirmação |
| `sendList` | Serviços, datas, horários |
| `sendText` | Confirmações, erros, listagem |

## Cancelamento

1. Cliente escolhe "Cancelar" no menu
2. Informa o código do agendamento (últimos 8 caracteres do ID)
3. Status alterado para `CANCELLED`

## Reagendamento

1. Cliente escolhe "Reagendar"
2. Informa o código do agendamento
3. Agendamento anterior é cancelado
4. Fluxo de novo agendamento inicia

## Sessão do usuário

O estado da conversa é armazenado em `WhatsAppSession`:

| Step | Descrição |
|------|-----------|
| IDLE | Menu principal |
| CHOOSING_SERVICE | Selecionando serviço |
| CHOOSING_DATE | Selecionando data |
| CHOOSING_TIME | Selecionando horário |
| CONFIRMING | Aguardando confirmação |
| CANCELLING | Fluxo de cancelamento |
| RESCHEDULING | Fluxo de reagendamento |

## Modo simulação

Se as variáveis `EVOLUTION_API_*` não estiverem configuradas, as mensagens são logadas no console sem envio real. Útil para desenvolvimento sem WhatsApp conectado.

## Automações (cron)

Configure `CRON_SECRET` no `.env` e chame **a cada 5–10 minutos**:

```http
GET https://seu-dominio/api/cron/followup?secret=SUA_CRON_SECRET
```

Ou: `Authorization: Bearer SUA_CRON_SECRET`

Esse endpoint executa (opcional — o bot também processa lembretes a cada mensagem recebida):
- **Reset de sessão** (30 min) + reenvio de boas-vindas
- **Follow-up** por inatividade (10 min, configurável)
- **Lembrete 4h** antes do agendamento (`reminder_4h`)
- **Aviso 30 min** antes pedindo *CONFIRME* (`reminder_30min`)
- **Auto-cancelamento** se não confirmar no prazo

Alternativa só lembretes:

```http
GET https://seu-dominio/api/cron/reminders?secret=SUA_CRON_SECRET
```

**Pós-atendimento:** ao marcar agendamento como *Concluído* no painel, envia WhatsApp de agradecimento (`appointment_thankyou`).

## Lembrete 24h antes (legado)

O sistema envia um WhatsApp automático cerca de **24 horas antes** do horário do agendamento (status Confirmado ou Pendente).

1. Defina no `.env`:

```env
CRON_SECRET="sua-chave-secreta"
```

2. Chame o endpoint **a cada hora** (Agendador de Tarefas do Windows, cron Linux ou UptimeRobot):

```http
GET https://seu-dominio/api/cron/reminders?secret=SUA_CRON_SECRET
```

Ou com header: `Authorization: Bearer SUA_CRON_SECRET`

Cada agendamento recebe o lembrete apenas uma vez (`reminderSentAt` no banco).

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Bot não responde | Verifique webhook e `whatsappEnabled` nas configurações |
| Botões não aparecem | Confirme versão da Evolution API compatível |
| Horários vazios | Verifique dias/horários em Configurações |
| Webhook 401/403 | Confirme URL pública acessível |
