# Fluxo conversacional — Garagem do Ka

Mapa de estados, gatilhos e transições do atendimento no WhatsApp, e o roteiro
de mensagens que cada etapa produz. Este documento é a fonte da verdade do
roteiro; a copy mora em `src/lib/whatsapp-copy.ts` e em `bot_prompts` (painel), e
a lógica de estado em `src/lib/whatsapp-flow.ts`.

## 1. Mapa de estados

```
                    ┌──────────────────────────────────────────────┐
                    │  webhook: /api/whatsapp/webhook (Wafly)       │
                    │  corta grupo, status, mídia sem legenda,      │
                    │  eco do próprio bot e id repetido             │
                    └───────────────────────┬──────────────────────┘
                                            │ conversa privada
                                            ▼
                                   ┌─────────────────┐
                            ┌──────│   SAUDAÇÃO      │
                            │      └────────┬────────┘
                 cliente novo│               │cliente com cadastro
                            ▼               ▼
              ETAPA1_AWAITING_NAME    ETAPA2_MAIN_MENU
                   (pede o nome)      (menu + "mesmo veículo?")
                            │               │
                            └───────┬───────┘
                                    ▼
                          ┌──────────────────┐        8 ┌───────────────────┐
                          │ ETAPA2_MAIN_MENU │──────────│ tabela completa   │
                          └────────┬─────────┘          │ (cartão, sem etapa)│
                        1-7│       │9                   └───────────────────┘
                           ▼       └────────► handoff humano (bot pausa)
                    ┌──────────────┐
                    │ ETAPA2_SUB   │  0 = voltar ao menu
                    └──────┬───────┘
                           ▼
                  ┌──────────────────┐  veículo já salvo e confirmado
                  │ ETAPA4_VEHICLE   │───────────────┐
                  └────────┬─────────┘               │
                           │ dados reconhecidos      │
                           ▼                         ▼
                  ┌──────────────────┐      ┌──────────────────┐
                  │ ETAPA_PROPOSTA   │◄─────│  (pula cadastro) │
                  │ 3 degraus        │      └──────────────────┘
                  └────────┬─────────┘
                           │ 1|2|3
                           ▼
                  ┌──────────────────┐  "pular"
                  │ ETAPA_EXTRAS     │─────────┐
                  │ complementos     │         │
                  └────────┬─────────┘         │
                           │ "1,3"             │
                           ▼                   ▼
                  ┌──────────────────────────────────┐
                  │ ETAPA7_DAY → ETAPA7_TIME         │
                  │ atalhos · semana · dia · período │
                  └────────────────┬─────────────────┘
                                   ▼
                  ┌──────────────────────────────────┐
                  │ ETAPA15_SUMMARY_CONFIRM          │
                  │ 1 confirmar · 2 data · 3 pagto   │
                  │ 4 cupom · 5 leva-e-traz          │
                  └────────────────┬─────────────────┘
                                   │ 1
                                   ▼
                  ┌──────────────────────────────────┐
                  │ RESERVA CRIADA → ticket + links  │
                  │ volta para ETAPA2_MAIN_MENU      │
                  └────────────────┬─────────────────┘
                                   ▼
                       ┌───────────────────────┐
                       │ PÓS-AGENDAMENTO       │
                       │ consultar · remarcar  │
                       │ cancelar              │
                       └───────────────────────┘
```

### Estados e gatilhos

| Estado | Entra quando | Sai com | Vai para |
| --- | --- | --- | --- |
| `ETAPA1_AWAITING_NAME` | primeira mensagem sem cadastro | nome válido | `ETAPA2_MAIN_MENU` |
| `ETAPA2_MAIN_MENU` | nome conhecido, `menu`, `0` no submenu | 1–7 categoria · 8 tabela · 9 humano · texto livre | `ETAPA2_SUB` · handoff · IA |
| `ETAPA2_SUB` | categoria escolhida | número do serviço · `0` | `ETAPA4_VEHICLE` · menu |
| `ETAPA4_VEHICLE` | serviço escolhido sem veículo | dados reconhecidos | `ETAPA_PROPOSTA` |
| `ETAPA_PROPOSTA` | veículo + serviço conhecidos | 1 · 2 · 3 | `ETAPA_EXTRAS` |
| `ETAPA_EXTRAS` | degrau escolhido | números · `pular` | `ETAPA7_DAY` |
| `ETAPA7_DAY` | serviço e duração fechados | atalho `data hora` · `semana:*` · data escrita | `ETAPA15` · `ETAPA7_TIME` |
| `ETAPA7_TIME` | dia escolhido | `periodo:*` · horário | `ETAPA15_SUMMARY_CONFIRM` |
| `ETAPA15_SUMMARY_CONFIRM` | data e hora fechadas | 1 confirma · 2 data · 3 pagamento · 4 cupom · 5 logística | reserva · etapas laterais |
| `ETAPA10_FAQ` | dúvida em qualquer ponto | resposta da IA · `voltar` | estado anterior |

### Comandos globais (valem em qualquer estado)

| Entrada | Efeito |
| --- | --- |
| `menu`, `início` | volta ao menu principal, mantém nome e veículo |
| `voltar`, `0` | volta um nível (submenu → menu, período → dia) |
| `9`, "falar com atendente", "quero uma pessoa" | handoff: bot pausa, painel recebe a conversa |
| "meus agendamentos", "meu horário" | lista as reservas ativas |
| "cancelar", "desmarcar" | confirmação → cancelamento (só em etapas de descanso) |
| "remarcar", "reagendar", "mudar o horário" | leva ao calendário mantendo o horário antigo até confirmar |
| `CONFIRME` | confirma presença no lembrete de 2h |

### Regras de sessão

- **Timeout:** 1 hora sem resposta zera a etapa. A próxima mensagem recebe a
  saudação completa e continua de onde faz sentido, sem perder nome nem veículo.
- **Handoff:** enquanto o atendimento humano estiver aberto, o bot não responde.
  Ao encerrar no painel, a próxima mensagem do cliente recebe boas-vindas.
- **Entrada inválida:** reorienta no mesmo estado, nunca reinicia o fluxo. Depois
  de duas tentativas sem entendimento, oferece o atendimento humano.
- **Fora do horário:** aviso com o horário de retorno (exceto no modo de teste).

## 2. Roteiro de mensagens

| # | Etapa | Componente | Cartão | Texto (resumo) |
| --- | --- | --- | --- | --- |
| 1 | Saudação | imagem + legenda | `generateWelcomeCard` | "Aqui é a assistente da *Garagem do Ka*… Como prefere ser chamado(a)?" |
| 2 | Menu principal | lista nativa | — | "*{nome}*, do que seu carro precisa hoje?" + 7 categorias, tabela e atendente |
| 3 | Tabela completa | imagem + legenda | `generateCatalogCard` | "Essa é a tabela completa 📋 Guarde ou encaminhe." |
| 4 | Serviços da categoria | lista nativa | — | "*{categoria}*" + serviços com preço e duração |
| 5 | Serviço escolhido | imagem + legenda | `generateServiceCard` | "*{serviço}* — R$ {preço} · {duração}" |
| 6 | Dados do veículo | texto | — | "Agora me conte do carro em *uma mensagem só*: modelo e ano, placa, cor, estado." |
| 7 | Proposta | imagem + lista | `generateProposalCard` | "Montei 3 caminhos para o *{veículo}*" |
| 8 | Complementos | imagem + lista | `generateExtrasCard` | "O carro já vai ficar aqui — quer aproveitar?" |
| 9 | Horários | imagem + lista | `generateSlotsCard` | "*Quando fica melhor?*" |
| 10 | Resumo | imagem + lista | `generateSummaryCard` | "*Resumo do agendamento*" + confirmar/alterar |
| 11 | Reserva | imagem + legenda | `generateTicketCard` | "Reservado, *{nome}* 🤝" + rota, agenda e retorno |

Mensagens de apoio: dúvida (IA), entrada inválida, handoff, cancelamento,
remarcação e lembretes vivem em `src/lib/whatsapp-copy.ts`.

## 3. Onde mexer

| Assunto | Arquivo |
| --- | --- |
| Copy das etapas | `src/lib/whatsapp-copy.ts` e tabela `bot_prompts` |
| Estado e transições | `src/lib/whatsapp-flow.ts` |
| Cartões (imagem) | `src/lib/whatsapp-cards.ts` |
| Catálogo e menus | `src/lib/whatsapp-service-catalog.ts` |
| Cancelar / remarcar | `src/lib/whatsapp-appointment-change.ts` |
| Entrada do webhook | `src/app/api/whatsapp/webhook/route.ts` |
| Links (mapa, agenda) | `src/lib/whatsapp-links.ts` |
