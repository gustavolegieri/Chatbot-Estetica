/** Defaults dos prompts do bot — usados no seed e como fallback */

export interface PromptDef {
  key: string;
  label: string;
  category: string;
  content: string;
  hint?: string;
}

export const BOT_PROMPT_DEFAULTS: PromptDef[] = [
  {
    key: "etapa1_welcome",
    label: "Boas-vindas (etapa 1)",
    category: "fluxo",
    hint: "{businessName}, {address}, {hours}",
    content: `Olá! Seja muito bem-vindo(a) à *{businessName}* 🚗✨

Aqui não fazemos lavagem comum — somos especialistas em *estética automotiva premium*: serviços que cuidam, protegem e valorizam o seu veículo de verdade.

O que fazemos por você:
🔹 *Lavagem detalhada* — muito além de água e sabão
🔹 *Polimento técnico* — riscos e opacidade eliminados
🔹 *Proteção de pintura* — vitrificação e cristalização
🔹 *Higienização interior* — renovação completa por dentro
🔹 *Detalhamentos completos* — carro como saído da concessionária

📍 {address}
🕐 {hours}

Para começarmos, qual é o seu *nome*? 😊`,
  },
  {
    key: "etapa2_main_menu",
    label: "Menu principal (etapa 2)",
    category: "fluxo",
    hint: "{clientName}, {menu}",
    content: `Que bom te ter aqui, *{clientName}*! 😊

O que seu carro precisa hoje?

{menu}`,
  },
  {
    key: "service_action_menu",
    label: "Ações após detalhe do serviço",
    category: "fluxo",
    content: `O que você quer fazer?

*1* 📅 Quero agendar
*2* 🔄 Ver outros serviços
*3* 💬 Tenho uma dúvida`,
  },
  {
    key: "package_action_menu",
    label: "Ações — pacotes",
    category: "fluxo",
    content: `*1* 📅 Agendar um pacote
*2* 🔍 Comparar pacotes
*3* 🔧 Ver serviços avulsos`,
  },
  {
    key: "etapa4_vehicle",
    label: "Pedir modelo do veículo",
    category: "fluxo",
    content: `Qual é o *modelo* do seu veículo? 🚗

_Exemplos: Civic, Corolla, Hilux, Onix, Compass, HB20_

_Ou envie modelo e ano juntos: *Civic 2021*_`,
  },
  {
    key: "etapa4_vehicle_has",
    label: "Veículo já informado",
    category: "fluxo",
    content: `Perfeito — já tenho seu veículo anotado 🚗
Vamos para o orçamento!`,
  },
  {
    key: "etapa4_ask_year",
    label: "Pedir ano do veículo",
    category: "fluxo",
    hint: "{model}",
    content: `Anotado: *{model}* 👍

Qual o *ano* do veículo?

_Exemplo: 2021, 2019, 2018_`,
  },
  {
    key: "vehicle_model_not_understood",
    label: "Modelo não entendido",
    category: "fluxo",
    content: `Não identifiquei o modelo 😅

Envie só o *modelo* do carro (marca/modelo):
_Ex: Civic, Fiat Argo, Hilux SW4_`,
  },
  {
    key: "vehicle_year_not_understood",
    label: "Ano não entendido",
    category: "fluxo",
    content: `Preciso do *ano* com 4 dígitos 😊

_Exemplo: 2021, 2019, 2015_`,
  },
  {
    key: "vehicle_not_understood",
    label: "Veículo não validado",
    category: "fluxo",
    content: `Não consegui validar o veículo 😅

Envie *modelo e ano*, por exemplo:
_Civic 2021_
_Hilux 2019_
_Onix 2020_`,
  },
  {
    key: "etapa5_quote",
    label: "Orçamento (etapa 5)",
    category: "fluxo",
    hint: "{name}, {vehicle}, {service}, {valueLine}, {time}, {pitch}",
    content: `Aqui está o orçamento para você, *{name}*:

━━━━━━━━━━━━━━━━━━━━
🚗 *Veículo:* {vehicle}
🔧 *Serviço:* {service}
━━━━━━━━━━━━━━━━━━━━
{pitch}

{valueLine}
⏱️ *Tempo estimado:* {time}

_O valor exato confirmamos na avaliação presencial — às vezes o carro surpreende para melhor ou para pior 😊_

O que você quer fazer?

*1* 📅 Agendar agora
*2* 🔄 Ver outro serviço
*3* 💬 Tenho dúvidas antes`,
  },
  {
    key: "etapa6_upsell",
    label: "Upsell (etapa 6)",
    category: "fluxo",
    hint: "{service}, {complement}, {benefit}",
    content: `Uma sugestão rápida antes de agendar 💡

Muitos clientes que fazem *{service}* aproveitam a visita e incluem *{complement}* no mesmo dia.

Por quê faz sentido: {benefit}

Sai mais em conta junto e você aproveita melhor a ida 😊

*1* ✅ Boa ideia, incluir {complement}
*2* ➡️ Não, seguir só com {service}`,
  },
  {
    key: "etapa7_day",
    label: "Escolha de dia",
    category: "fluxo",
    content: `Ótimo, vamos agendar! 📅

Qual dia você prefere?

*1* Segunda-feira
*2* Terça-feira
*3* Quarta-feira
*4* Quinta-feira
*5* Sexta-feira
*6* Sábado

_Ou escreva: *amanhã*, *sexta*, *15/06*_ 📆`,
  },
  {
    key: "etapa7_time",
    label: "Horários disponíveis",
    category: "fluxo",
    hint: "{dayLabel}, {slots}, {durationLabel}",
    content: `Horários disponíveis em *{dayLabel}*:

_Seu serviço leva ~*{durationLabel}* — esse intervalo fica bloqueado na agenda._

{slots}

_Ou digite o horário, ex: *09:00*_`,
  },
  {
    key: "etapa7_no_slots",
    label: "Sem horários no dia",
    category: "fluxo",
    hint: "{dayLabel}",
    content: `Não há horários livres em *{dayLabel}* para a duração do seu serviço 😔

Escolha outro dia:`,
  },
  {
    key: "etapa8_payment",
    label: "Forma de pagamento",
    category: "fluxo",
    hint: "{options}",
    content: `Quase lá! Só mais uma coisa 🎉

Como você prefere pagar?

{options}

_Pagamento realizado no dia do serviço._`,
  },
  {
    key: "etapa8_payment_compact",
    label: "Forma de pagamento (compacto)",
    category: "fluxo",
    hint: "{options}",
    content: `Como você prefere pagar?

{options}`,
  },
  {
    key: "etapa8_pix_block",
    label: "Dados PIX",
    category: "fluxo",
    hint: "{pixKey}, {pixHolder}, {pixBank}, {businessName}",
    content: `━━━━━━━━━━━━━━━━━━━━
💸 *Dados para PIX*
━━━━━━━━━━━━━━━━━━━━
🔑 *Chave:* {pixKey}
👤 *Titular:* {pixHolder}
{bankLine}
━━━━━━━━━━━━━━━━━━━━
_Envie o comprovante no dia do serviço 😊_`,
  },
  {
    key: "etapa8_pix_choice",
    label: "Escolha de PIX",
    category: "fluxo",
    hint: "",
    content: `💸 *Como você prefere pagar via PIX?*

*1* PIX (Pagar agora)
*2* PIX (Pagar na entrega)

Escolha uma opção:`,
  },
  {
    key: "etapa8_receipt_upload",
    label: "Solicitação de comprovante",
    category: "fluxo",
    hint: "{value}",
    content: `📸 *Por favor, envie o comprovante de pagamento*

Valor a ser pago: *{value}*

Você pode enviar uma foto ou print do comprovante PIX.`,
  },
  {
    key: "etapa8_receipt_invalid",
    label: "Comprovante inválido",
    category: "fluxo",
    hint: "{expected}, {received}",
    content: `❌ *Valor do comprovante não confere*

Valor esperado: *{expected}*
Valor encontrado: *{received}*

Por favor, envie um comprovante com o valor correto.`,
  },
  {
    key: "etapa8_receipt_error",
    label: "Erro ao ler comprovante",
    category: "fluxo",
    hint: "",
    content: `❌ *Não foi possível ler o comprovante*

Por favor, envie uma foto mais nítida do comprovante ou tente novamente.`,
  },
  {
    key: "etapa9_confirm",
    label: "Confirmação final",
    category: "fluxo",
    hint: "{name}, {vehicle}, {services}, {day}, {time}, {payment}, {value}, {address}, {pixBlock}",
    content: `🎉 *Agendamento Confirmado!*

Tudo certo, *{name}*! Seu agendamento está registrado. Aqui está o resumo completo:

▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
👤 *Cliente:* {name}
🚗 *Veículo:* {vehicle}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
🔧 *Serviço(s):* {services}
📅 *Data:* {day}
🕐 *Horário:* {time}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
💳 *Pagamento:* {payment}
💰 *Valor estimado:* {value}
_↳ Valor exato confirmado na avaliação presencial_
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
📍 *Onde nos encontrar:*
{address}
{pixBlock}
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
📌 *O que acontece agora:*

1️⃣ Você receberá uma confirmação no dia anterior
2️⃣ No dia, é só chegar no horário combinado
3️⃣ A gente cuida do resto — promessa 💎

Dúvida de última hora? Manda mensagem aqui mesmo 😊

⏰ *4h antes* enviamos lembrete — responda *CONFIRME* para garantir o horário.

Te esperamos, *{name}*! Vai sair incrível 🚗✨`,
  },
  {
    key: "stale_return",
    label: "Retorno após inatividade",
    category: "fluxo",
    hint: "{name}, {contextLine}, {continueLine}",
    content: `Oi{name}! 😊

{contextLine}

{continueLine}

*1* ✅ Sim, continua!
*2* 🔄 Quero começar do zero`,
  },
  {
    key: "indecisive_vehicle",
    label: "Cliente indeciso — veículo",
    category: "fluxo",
    content: `Sem problema — vou te ajudar a descobrir o melhor! 😊

Qual o *modelo* do seu veículo?
_Ex: Civic, Hilux, Onix — ou *Civic 2021*_`,
  },
  {
    key: "indecisive_problem",
    label: "Cliente indeciso — problema",
    category: "fluxo",
    content: `Perfeito 🚗

O que está acontecendo?

*1* 🎨 Pintura opaca, riscada ou sem brilho
*2* 🪑 Interior com cheiro ruim ou muito sujo
*3* 🛡️ Quero proteger um carro novo ou recém-comprado
*4* ✨ Quero um cuidado geral completo
*5* 🔧 Outro problema`,
  },
  {
    key: "invalid_menu",
    label: "Opção inválida",
    category: "fluxo",
    hint: "{menu}",
    content: `Ops, essa opção não existe 😅

Escolhe uma dessas:

{menu}`,
  },
  {
    key: "followup_recovery",
    label: "Follow-up por inatividade",
    category: "automacao",
    hint: "{name}",
    content: `Oi{name}! 😊

Ainda posso te ajudar com nossos serviços. É só responder aqui 🚗✨`,
  },
  {
    key: "reminder_4h",
    label: "Lembrete 4h antes",
    category: "automacao",
    hint: "{brand}, {name}, {service}, {duration}, {dateLabel}, {time}, {address}",
    content: `⏰ *Lembrete — {brand}*

Olá, *{name}*!

Seu agendamento é *hoje*:
🔧 *{service}* (~{duration})
📅 {dateLabel} às *{time}*
{addressLine}

Responda *CONFIRME* para garantir seu horário ✅`,
  },
  {
    key: "reminder_30min",
    label: "Aviso 30min antes",
    category: "automacao",
    hint: "{name}, {service}, {time}",
    content: `⚠️ *Confirmação urgente*

Olá, *{name}*! Seu agendamento de *{service}* é às *{time}*.

Responda *CONFIRME* agora — sem confirmação, o horário pode ser liberado.`,
  },
  {
    key: "appointment_cancelled",
    label: "Cancelamento automático",
    category: "automacao",
    hint: "{name}, {dateLabel}, {time}, {service}, {reason}",
    content: `Olá, *{name}*!

Seu agendamento foi *cancelado*:
📅 {dateLabel} às {time}
🔧 {service}

{reason}

Para reagendar, envie *menu* aqui no WhatsApp 😊`,
  },
  {
    key: "appointment_thankyou",
    label: "Agradecimento pós-serviço",
    category: "automacao",
    hint: "{name}, {brand}, {service}",
    content: `Olá, *{name}*! ✨

Obrigado por confiar na *{brand}*!

Seu serviço *{service}* foi concluído com sucesso 🚗

Foi um prazer cuidar do seu veículo. Esperamos você em breve!`,
  },
  {
    key: "category_1",
    label: "Categoria 1 — Lavagem",
    category: "categorias",
    content: "Lavagem",
  },
  {
    key: "category_2",
    label: "Categoria 2 — Polimento",
    category: "categorias",
    content: "Polimento",
  },
  {
    key: "category_3",
    label: "Categoria 3 — Proteção",
    category: "categorias",
    content: "Proteção & Brilho",
  },
  {
    key: "category_4",
    label: "Categoria 4 — Interior",
    category: "categorias",
    content: "Interior",
  },
  {
    key: "category_5",
    label: "Categoria 5 — Detalhes",
    category: "categorias",
    content: "Detalhes Especiais",
  },
  {
    key: "category_6",
    label: "Categoria 6 — Revitalização",
    category: "categorias",
    content: "Revitalização",
  },
  {
    key: "category_7",
    label: "Categoria 7 — Pacotes",
    category: "categorias",
    content: "Pacotes Premium",
  },
  {
    key: "category_8",
    label: "Categoria 8 — Ajuda",
    category: "categorias",
    content: "Ajuda na escolha",
  },
  {
    key: "etapa9_coupon",
    label: "Cupom de desconto",
    category: "fluxo",
    content: `Você tem um cupom de desconto?

Se sim, me envie o código agora.
Se não, responda *não* para seguir para os pontos de fidelidade.`,
  },
  {
    key: "etapa9_loyalty",
    label: "Pontos de fidelidade",
    category: "fluxo",
    hint: "{points}, {discountValue}",
    content: `Você tem *{points}* pontos de fidelidade! 🎁

Pode usar para ganhar *{discountValue}* de desconto.

*1* ✅ Usar pontos
*2* ❌ Não usar pontos`,
  },
  {
    key: "etapa10_budget",
    label: "Confirmação de orçamento",
    category: "fluxo",
    hint: "{value}",
    content: `━━━━━━━━━━━━━━━
📋 **Seu orçamento**
━━━━━━━━━━━━━━━
💰 **Valor total: {value}**
━━━━━━━━━━━━━━━

Vamos confirmar o agendamento?

*1* ✅ Sim, confirmar
*2* ❌ Não, voltar ao menu`,
  },
  {
    key: "etapa10_logistics",
    label: "Logística - escolha",
    category: "fluxo",
    content: `🚚 Como prefere?

*1* - Deixe eu levo o carro até a estética
*2* - A estética vai buscar o carro`,
  },
  {
    key: "etapa10_logistics_client_leads",
    label: "Logística - cliente leva",
    category: "fluxo",
    content: `📍 Combinado! Você pode levar o carro até a loja quando puder.`,
  },
  {
    key: "etapa10_logistics_pickup_address",
    label: "Logística - endereço pickup",
    category: "fluxo",
    content: `🚚 Ótimo! Me envie o endereço completo onde o carro está para calcular a taxa de busca.`,
  },
  {
    key: "etapa10_logistics_return_preference",
    label: "Logística - preferência entrega",
    category: "fluxo",
    content: `Perfeito! E quando o serviço terminar, como prefere?

*1* Vocês devolvem o carro no mesmo endereço
*2* Eu mesmo venho buscar o carro`,
  },
  {
    key: "etapa10_logistics_with_return",
    label: "Logística - com devolução",
    category: "fluxo",
    content: `🔄 Devolução incluída no resumo.`,
  },
  {
    key: "etapa10_logistics_without_return",
    label: "Logística - sem devolução",
    category: "fluxo",
    content: `📍 Sem devolução, tudo certo.`,
  },
  {
    key: "etapa15_summary_confirm",
    label: "Resumo e confirmação",
    category: "fluxo",
    hint: "{name}, {service}, {vehicle}, {day}, {time}, {pickup}, {address}, {payment}, {reminder}, {value}",
    content: `━━━━━━━━━━━━━━━
📋 **RESUMO DO AGENDAMENTO**
👤 {name}
🧧 *{service}*
🚘 {vehicle}
📅 {day}
⏰ {time}
🚚 Leva e traz: {pickup}
📍 Endereço: {address}
💳 {payment}
🔔 Lembrete: {reminder}
💰 **{value}**
━━━━━━━━━━━━━━━

⏱️ Cancelamento até 2h antes sem custo.

✅ Confirma? (sim/não)`,
  },
  {
    key: "etapa16_confirmation",
    label: "Confirmação final",
    category: "fluxo",
    hint: "{address}, {hours}",
    content: `✅ *Agendamento confirmado!*

Seu atendimento está reservado.

📍 Endereço: *{address}*
🕒 Horário: *{hours}*

Cancelamentos com até 2h de antecedência sem custo.

Posso te ajudar com mais alguma coisa? 😊`,
  },
];
