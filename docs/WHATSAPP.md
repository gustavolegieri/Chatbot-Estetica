# Integração WhatsApp (Evolution API)

## Visão geral

O bot de WhatsApp guia o cliente por um fluxo conversacional para agendar, consultar, cancelar ou reagendar serviços.

## Fluxo do Bot (Garagem do Ka)

Atendente virtual premium com etapas numeradas, anti-flood (debounce ~2,8s) e apenas chats privados.

```
Primeira mensagem → Boas-vindas + pedir nome
Nome → Menu (lista com as categorias de serviço)
Categoria → Lista dos serviços da categoria
Serviço → Detalhe + preço + pedido dos dados do veículo (mesma mensagem)
Veículo → Orçamento na legenda do calendário + lista de datas
Data → (atalho de horário) ou semana → dia → período → horário
Horário → Resumo + botões → Reserva confirmada
```

O caminho rápido são **7 respostas do cliente**: quem toca em um dos atalhos de
horário da primeira lista fecha data e hora de uma vez. Quem quer escolher com
calma navega semana → dia → horário, sem sair das listas.

O que saiu do caminho obrigatório:

| Etapa removida | Por quê | Como continua acessível |
| --- | --- | --- |
| "Quer agendar este serviço?" | Escolher o serviço na lista já é a decisão de agendar | Escrever *menu* ou o nome de outro serviço |
| "Confirma que é um Fiesta 2012?" | O veículo aparece no orçamento e no resumo | Escrever o dado correto a qualquer momento |
| Cupom, logística, pagamento e lembrete | Padrões assumidos; era a cauda onde o cliente desistia | Opções do próprio resumo |

**Comandos:** `menu` volta ao menu principal (se o nome já foi informado).

**Interpretação livre:** o cliente pode enviar veículo e serviço na mesma mensagem (ex.: *Hilux preta 2021 com riscos, quero vitrificação*).

**Sessão:** após **1 hora** sem resposta, o bot limpa a etapa anterior. Na próxima mensagem do cliente, sempre envia as boas-vindas completas antes de retomar o atendimento.

**Handoff:** ao encerrar atendimento humano no painel, a *próxima mensagem* do cliente recebe boas-vindas + menu principal.

**Confirmação de presença:** responda *CONFIRME* (não use o número `1` do menu). A confirmação padrão é enviada cerca de **2 horas antes** e o aviso final 30 minutos antes. Em produção, `/api/cron/reminders` deve ser chamado a cada 5 minutos por um agendador HTTP.

**Fora do horário:** mensagens recebidas após o fechamento (ou fora dos dias de funcionamento) recebem aviso automático com horário de retorno.

Arquivos principais: `src/lib/whatsapp-bot.ts`, `whatsapp-flow.ts`, `whatsapp-catalog.ts`, `whatsapp-flow-messages.ts`.

## Provedor de envio (Wafly)

`WHATSAPP_PROVIDER` escolhe a API de envio: `wafly`, `zapster` ou `wasender`
(padrão). O corpo das mensagens continua sendo escrito no formato histórico da
Wasender; `src/lib/whatsapp-provider.ts` traduz para o provedor ativo.

```env
WHATSAPP_PROVIDER=wafly
WAFLY_BASE_URL=https://wafly.com.br/api-bridge-whats
WAFLY_INSTANCE=<id da instância>
WAFLY_TOKEN=<token da instância>
WAFLY_WEBHOOK_TOKEN=<segredo que vai na URL do webhook>
```

A Wafly autentica pelo caminho (`/instances/{id}/token/{token}/{ação}`) e exige
também o header `Client-Token`. `WAFLY_CLIENT_TOKEN` só é necessário quando a
conta usa um token de segurança diferente do token da instância.

### Webhook

Registre na Wafly, em *webhook ao receber*:

```
https://SEU-DOMINIO/api/whatsapp/webhook?token=<WAFLY_WEBHOOK_TOKEN>
```

A Wafly não assina os eventos, então o segredo viaja na URL: sem ele o endpoint
responde 401. Sem `WAFLY_WEBHOOK_TOKEN` configurado a verificação é dispensada.

Diferente da Wasender, a Wafly entrega a mídia **já descriptografada**: o áudio
chega em `audio.audioUrl` e vai direto para a transcrição, sem a chamada de
`decrypt-media`.

### Menus, listas e botões

As etapas continuam escrevendo menus como texto (`*1* — Opção`), e as mensagens
seguem editáveis pelo painel de prompts. `src/lib/whatsapp-interactive.ts` lê
essa convenção na saída e monta a mensagem nativa:

- **2 ou 3 opções** → botões (`send-button-list`);
- **4 a 12 opções** → lista (`send-option-list`);
- **acima de 12** → lista com as 12 primeiras e aviso para escrever a opção;
- **provedor sem suporte** → o texto numerado de sempre.

O id de cada opção é o próprio número, então a resposta do menu chega ao fluxo
como se o cliente tivesse digitado. `WHATSAPP_INTERACTIVE_MENUS=false` desliga o
recurso e volta tudo para texto.

#### Limites medidos no aparelho

A documentação do WhatsApp não descreve o que esta conta entrega. Estes números
saíram de testes na instância real e estão registrados em
`src/lib/whatsapp-interactive.ts`:

| O que | Resultado |
| --- | --- |
| `send-button-actions` | Responde 200, mas chega como texto puro |
| `send-button-list` / `send-option-list` | Renderizam botão e lista |
| `optionList.sections` (lista agrupada) | **Não chega ao aparelho** |
| Linhas por lista | 12 renderizaram (o limite de 10 da documentação não vale) |
| Título da linha | 28 caracteres inteiros; 34 aparece cortado |

Como seções não funcionam, agrupar é feito com **etapas de lista**: semana → dia
→ período → horário, em vez de uma lista única com cabeçalhos.

#### Como o texto da linha é encurtado

Todo o corte mora em `src/lib/whatsapp-list-text.ts`, e só lá. Antes, o fluxo
encurtava, o `sendList` cortava de novo e o adaptador do provedor cortava mais
uma vez em 24 caracteres — o cliente recebia palavras partidas no meio mesmo
quando o nome caberia inteiro.

A ordem das tentativas, da menos destrutiva para a mais:

1. **cabe?** usa o nome como está;
2. **palavra repetida na lista inteira** sai de todas as linhas — a categoria já
   está no cabeçalho, então "Higienização dos Bancos de Tecido" vira "Bancos de
   Tecido" quando as quatro linhas começam igual;
3. **palavras de ligação** saem ("Higienização dos Bancos de Tecido" →
   "Higienização Bancos Tecido");
4. **pontuação** sai (é o que faz "Bancos Teto Carpete (Tecido)" caber em 28);
5. só então vem o corte com reticências.

O parêntese final é sempre preservado: é ele que separa "… (Tecido)" de
"… (Couro)". E se duas linhas acabarem com o mesmo título, as duas voltam para a
versão longa — duas linhas idênticas são piores que uma truncada.

O nome completo vai para a descrição da linha sempre que o título precisou
encolher, então nada some da tela.

Botão tem rótulo mais apertado que linha de lista. Quando um menu de até três
opções tem rótulo que não caberia no botão, ele vira lista: nome de serviço
truncado em botão é pior que lista com o nome inteiro.

Legenda de mídia não aceita menu. Quando a mensagem tem imagem *e* opções — o
calendário com as datas, o resumo com o cartão do agendamento —, a imagem vai
com a legenda e as opções seguem em uma segunda mensagem, essa sim tocável.

### Escolha de data e horário

`sendDayPicker` envia a imagem do calendário e, logo abaixo, uma lista que
começa por atalhos (o primeiro horário livre de cada um dos próximos dias, com
id `AAAA-MM-DD HH:mm`) e segue pelas semanas (`semana:AAAA-MM-DD`). Tocar em uma
semana abre os dias com vaga; tocar em um dia abre os horários. Um dia com mais
horários do que cabe na lista abre primeiro por período — manhã, tarde e noite,
com a contagem de cada um.

A agenda das quatro semanas vem em uma consulta só
(`generateAvailableSlotsRange`), não uma por dia.

`flow.availableSlots` guarda sempre o dia inteiro, mesmo quando a lista mostra
só um período: é ele que valida um horário escrito à mão. `flow.pickerOptions`
guarda a ordem das linhas mostradas, para que digitar "2" caia na mesma opção
que tocar na segunda linha.

### Resposta escrita em qualquer etapa

O cliente não responde só com toques. Quando a etapa não reconhece a mensagem —
"na verdade quero polimento" no meio da escolha da data, ou "quanto dura?" antes
de informar o veículo —, `routeFreeText` assume, nesta ordem:

1. pedido de atendente → transferência;
2. serviço reconhecido → abre aquele serviço;
3. categoria reconhecida → abre a lista da categoria;
4. pergunta → resposta da IA e a etapa é repetida logo em seguida.

Só quando nada disso se aplica é que aparece o "não entendi". A etapa tem sempre
o primeiro palpite: um número ou uma hora continuam sendo lidos como resposta da
lista, não como mudança de assunto.

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
- **Reset de sessão** (1 hora) + reenvio de boas-vindas
- **Follow-up** por inatividade (10 min, configurável)
- **Confirmação 2h** antes do agendamento (`reminder_4h`, chave legada)
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
