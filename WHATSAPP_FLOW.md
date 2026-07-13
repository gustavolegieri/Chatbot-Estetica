# Fluxo do WhatsApp - Garagem do Ka

Este documento descreve o fluxo completo de atendimento via WhatsApp, com todas as mensagens que o bot envia em cada etapa. Os textos são baseados diretamente no código-fonte.

## 📋 Estrutura do Fluxo

1. **ETAPA1_AWAITING_NAME** - Boas-vindas e coleta do nome
2. **ETAPA2_MAIN_MENU** - Menu principal de serviços
3. **ETAPA2_SUB** - Submenu de categorias
4. **ETAPA3_SERVICE_ACTION** - Detalhes do serviço
5. **ETAPA3_UNDECIDED_VEHICLE** - Cliente indeciso (veículo)
6. **ETAPA3_UNDECIDED_PROBLEM** - Cliente indeciso (problema)
7. **ETAPA4_VEHICLE** - Coleta de dados do veículo
8. **ETAPA5_QUOTE** - Apresentação do orçamento
9. **ETAPA5_FIRST_TIME_BONUS** - Bônus de primeira compra
10. **ETAPA6_UPSELL** - Oferta de serviços complementares
11. **ETAPA7_DAY** - Escolha da data
12. **ETAPA7_TIME** - Escolha do horário
13. **ETAPA9_COUPON** - Cupom de desconto
14. **ETAPA9_PICKUP** - Serviço de buscar e entregar
15. **ETAPA9_PICKUP_ADDRESS** - Endereço para pickup
16. **ETAPA9_RETURN_PREFERENCE** - Preferência de entrega
17. **ETAPA8_PAYMENT** - Forma de pagamento
18. **ETAPA8_PAYMENT_CARD_TYPE** - Tipo de cartão (débito/crédito)
19. **ETAPA8_PIX_CHOICE** - Escolha de PIX (agora vs na entrega)
20. **ETAPA8_RECEIPT_UPLOAD** - Upload de comprovante PIX
21. **ETAPA14_REMINDER** - Lembrete antes do agendamento
22. **ETAPA15_SUMMARY_CONFIRM** - Resumo e confirmação final
23. **ETAPA16_CONFIRMATION** - Mensagem final de confirmação

---

## 🤖 ETAPA 1 - Boas-vindas

**Mensagem enviada:** _(fonte: whatsapp-flow-messages.ts, linha 33)_
```
Olá! Seja muito bem-vindo(a) à *{businessName}* 🚗✨

Aqui não fazemos lavagem comum — somos especialistas em *estética automotiva premium*: serviços que cuidam, protegem e valorizam o seu veículo de verdade.

O que fazemos por você:
🔹 *Lavagem detalhada* — muito além de água e sabão
🔹 *Polimento técnico* — riscos e opacidade eliminados
🔹 *Proteção de pintura* — vitrificação e cristalização
🔹 *Higienização interior* — renovação completa por dentro
🔹 *Detalhamentos completos* — carro como saído da concessionária

📍 {address}
🕐 {hours}

Para começarmos, qual é o seu *nome*? 😊
```

**Resposta esperada:** Nome do cliente

---

## 📱 ETAPA 2 - Menu Principal

**Mensagem enviada:** _(fonte: whatsapp-flow-messages.ts, linha 38)_
```
Que bom te ter aqui, *{clientName}*! 😊

O que seu carro precisa hoje?

{menu}
```

**Menu real (8 categorias):** _(fonte: whatsapp-catalog.ts, linha 24)_
```
*1* Lavagem
*2* Polimento
*3* Proteção & Brilho
*4* Interior
*5* Detalhes Especiais
*6* Revitalização
*7* Pacotes Premium
*8* Ajuda na escolha
```

**Resposta esperada:** Número da opção desejada

---

## 📂 ETAPA 2 - Submenu (por categoria)

**Exemplo - Lavagem:**
```
💧 *Lavagem*

Escolha o tipo de lavagem:

*1* 🚗 Lavagem Simples - Lavagem externa básica
*2* ✨ Lavagem Detalhada - Lavagem completa com acabamento premium
*3* 🏠 Lavagem Completa - Externa + interna detalhada

*0* 🔙 Voltar ao menu principal
```

**Resposta esperada:** Número da opção desejada

---

## 🔧 ETAPA 3 - Detalhes do Serviço

**Exemplo - Lavagem Completa:** _(fonte: whatsapp-flow-messages.ts, linha 113)_
```
💧 *Lavagem Completa*

_Muito além da lavagem comum — brilho, proteção e interior renovado._

✨ *O que inclui:*
• Pré-lavagem com espuma ativa + lavagem externa manual
• Secagem cuidadosa com microfibra
• Limpeza interna básica com aspiração
• Pretinho nos pneus e acabamento impecável
• Revitalização de plásticos externos
• Aplicação de cera líquida para brilho intenso
• Limpeza e cristalização dos vidros

⏱️ 90 min
💰 *R$ 75*
```

**Menu de ações:** _(fonte: whatsapp-flow-messages.ts, linha 48)_
```
O que você quer fazer?

*1* 📅 Quero agendar
*2* 🔄 Ver outros serviços
*3* 💬 Tenho uma dúvida
```

**Resposta esperada:** Número da ação desejada

---

## 🚗 ETAPA 4 - Coleta de Veículo

**Solicitação progressiva dos 4 campos:** _(fonte: flow-validation.ts, linha 34)_
```
🚘 *Dados do veículo*

📌 Modelo: (ainda não informado)
📅 Ano: (ainda não informado)
🎨 Cor: (ainda não informado)
🔧 Estado: (ainda não informado)

Envie os dados que faltam, por exemplo:
Modelo: Honda Civic
Ano: 2020
Cor: Preto
Estado: Bom estado
```

**Confirmação dos dados:** _(fonte: whatsapp-flow.ts, linha 1117)_
```
🚘 *Confirmando os dados do veículo*

Modelo: *[Modelo]*
Ano: *[Ano]*
Cor: *[Cor]*
Estado: *[Estado]*

Está certo? (sim/não)
```

**Resposta esperada:** Dados do veículo (modelo, ano, cor, estado) + confirmação

---

## 💰 ETAPA 5 - Orçamento

**Mensagem enviada:** _(fonte: whatsapp-flow-messages.ts, linha 123)_
```
Aqui está o orçamento para você, *{name}*:

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
*3* 💬 Tenho dúvidas antes
```

**Resposta esperada:** Número da ação desejada

**Bônus de primeira compra (se cliente novo):** _(fonte: whatsapp-flow.ts, linha 1212)_
```
🎁 *Bônus! Primeira vez: 10% de desconto*

É sua primeira vez aqui! Ganhou *10% de desconto* no primeiro serviço.

💰 Desconto: R$ [Valor]

*1* ✅ Quero o desconto
*2* ❌ Não, obrigado
```

---

## 🎁 ETAPA 5 - Bônus de Primeira Compra

**Se cliente aceitar o desconto:** _(fonte: whatsapp-flow.ts, linha 1269)_
```
✅ *Desconto aplicado!*

Seu bônus de primeira compra foi ativado.

💰 Novo valor: R$ [Valor com desconto]

Vamos continuar com o agendamento?
```

**Se cliente recusar o desconto:** _(fonte: whatsapp-flow.ts, linha 1306)_
```
Sem problema! Vamos continuar com o valor original.

💰 Valor: R$ [Valor original]
```

---

## 💡 ETAPA 6 - Upsell (Serviços Complementares)

**Mensagem enviada:** _(fonte: whatsapp-flow.ts, linha 1221)_
```
✨ Que tal adicionar *[Complemento]*?

💰 **R$ [Valor]** a mais

*1* - Sim, incluir
*2* - Não, obrigado
```

**Resposta esperada:** 1 (aceitar) ou 2 (recusar)

---

## 📅 ETAPA 7 - Escolha da Data

**Imagem enviada:** Calendário visual com disponibilidade (SVG gerado dinamicamente)

**Legenda enviada:** _(fonte: calendar-helper.ts, linha 32)_
```
✅ Dias disponíveis:
🟢 Mais vazio  🟡 Médio  🔴 Mais movimentado
🚫 Domingos: fechado
📍 Hoje: destacado em azul

💬 *Digite o número do dia* (ex: 15)
🔙 *0* para voltar ao menu
```

**Lista interativa enviada:** Opções de dias disponíveis

**Resposta esperada:** Número do dia ou texto

---

## ⏰ ETAPA 7 - Escolha do Horário

**Mensagem enviada:** _(fonte: whatsapp-flow-messages.ts, linha 180)_
```
Horários disponíveis em *{dayLabel}*:

_Seu serviço leva ~*{durationLabel}* — esse intervalo fica bloqueado na agenda._

{slots}

_Ou digite o horário, ex: *09:00*_
```

**Resposta esperada:** Número do horário ou horário específico

---

## 🎟️ ETAPA 9 - Cupom de Desconto

**Mensagem enviada:** _(fonte: whatsapp-flow.ts, linha 1328)_
```
Você tem um cupom de desconto?

Se sim, me envie o código agora.
Se não, responda *não* para seguir para o pagamento.
```

**Resposta esperada:** Código do cupom ou "não"

---

## 🚚 ETAPA 9 - Serviço de Pickup

**Mensagem enviada:** _(fonte: whatsapp-flow.ts, linha 1339)_
```
Quer que a gente venha buscar o carro? 🚗💨

*1* Sim, quero o leva e traz
*2* Não, eu levo até a loja
```

**Resposta esperada:** 1 (sim) ou 2 (não)

---

### 📍 ETAPA 9 - Endereço para Pickup

**Se o cliente escolher pickup:** _(fonte: whatsapp-flow.ts, linha 1378)_
```
Show! Me manda o endereço completo onde está o carro (rua, número, bairro, cidade).
```

**Resposta esperada:** Endereço completo

**Confirmação do endereço:** _(fonte: whatsapp-flow.ts, linha 1470)_
```
📍 Endereço confirmado! Distância até a loja: [X] km
🚗 Taxa de busca e entrega: R$ [Valor]

Confirma esse endereço? (sim/não)
```

---

### 🔄 ETAPA 9 - Preferência de Entrega

**Mensagem enviada:** _(fonte: whatsapp-flow.ts, linha 1409)_
```
Perfeito! E quando o serviço terminar, como prefere?

*1* Vocês devolvem o carro no mesmo endereço
*2* Eu mesmo venho buscar o carro
```

**Resposta esperada:** Número da opção desejada

---

## 💳 ETAPA 8 - Forma de Pagamento

**Mensagem enviada:** _(fonte: whatsapp-flow.ts, linha 2132)_
```
Como você prefere pagar?

*1* PIX
*2* Cartão
*3* Dinheiro
```

**Resposta esperada:** Número da forma de pagamento

---

### 💳 ETAPA 8 - Tipo de Cartão

**Se o cliente escolher "Cartão":** _(fonte: whatsapp-flow.ts, linha 2152)_
```
Qual tipo de cartão você prefere?

*1* Débito
*2* Crédito
```

**Resposta esperada:** 1 (débito) ou 2 (crédito)

---

### 💸 ETAPA 8 - PIX

**Se o cliente escolher PIX:** _(fonte: whatsapp-flow-messages.ts, linha 229)_
```
💸 *Como você prefere pagar via PIX?*

*1* PIX (Pagar agora)
*2* PIX (Pagar na entrega)

Escolha uma opção:
```

**Se escolher "Pagar agora":**

**Imagem enviada:** QR Code PIX gerado dinamicamente (PNG base64)

**Texto enviado:** _(fonte: whatsapp-flow.ts, linha 1561)_
```
💳 **Pagamento via PIX**

Escaneie o QR Code abaixo para pagar:

Valor: R$ [Valor]
```

**Código PIX enviado:** _(fonte: whatsapp-flow.ts, linha 1563)_
```
Ou copie e cole o código PIX:
`[Código PIX Copia e Cola]`
```

**Dados para PIX (texto):** _(fonte: whatsapp-flow-messages.ts, linha 215)_
```
━━━━━━━━━━━━━━━━━━━━
💸 *Dados para PIX*
━━━━━━━━━━━━━━━━━━━━
🔑 *Chave:* [Chave PIX]
👤 *Titular:* [Nome do titular]
{bankLine}
━━━━━━━━━━━━━━━━━━━━
_Envie o comprovante no dia do serviço 😊_
```

---

### 📸 ETAPA 8 - Upload de Comprovante

**Mensagem enviada:** _(fonte: whatsapp-flow-messages.ts, linha 241)_
```
📸 *Por favor, envie o comprovante de pagamento*

Valor a ser pago: *{value}*

Você pode enviar uma foto ou print do comprovante PIX.
```

**Resposta esperada:** Imagem do comprovante

**Se o valor não conferir:** _(fonte: whatsapp-flow-messages.ts, linha 252)_
```
❌ *Valor do comprovante não confere*

Valor esperado: *{expected}*
Valor encontrado: *{received}*

Por favor, envie um comprovante com o valor correto.
```

**Se não for possível ler o comprovante:** _(fonte: whatsapp-flow-messages.ts, linha 264)_
```
❌ *Não foi possível ler o comprovante*

Por favor, envie uma foto mais nítida do comprovante ou tente novamente.
```

---

## 🔔 ETAPA 14 - Lembrete

**Mensagem enviada:** _(fonte: whatsapp-flow.ts, linha 1667)_
```
🔔 Quer receber um lembrete por WhatsApp 1h antes do horário agendado?

*1* Sim, quero lembrete
*2* Não precisa
```

**Resposta esperada:** 1 (sim) ou 2 (não)

---

## 🎴 ETAPA 15 - Resumo e Confirmação

**Imagem enviada:** Cartão de resumo visual (SVG gerado dinamicamente com logo, dados do agendamento e valor total)

**Texto enviado:** _(fonte: whatsapp-flow.ts, linha 1763)_
```
━━━━━━━━━━━━━━━
📋 **RESUMO DO AGENDAMENTO**
👤 [Nome do cliente]
🧽 *[Nome do serviço]*
🚘 [Veículo]
📅 [Data]
⏰ [Horário]
🚚 Leva e traz: [Sim/Não]
📍 Endereço: [Endereço se aplicável]
💳 [Forma de pagamento]
🔔 Lembrete: [Sim/Não]
💰 **R$ [Valor total]**
━━━━━━━━━━━━━━━

⏱️ Cancelamento até 2h antes sem custo.

✅ Confirma? (sim/não)
```

**Resposta esperada:** "sim" ou "não"

---

## ✅ ETAPA 16 - Confirmação Final

**Mensagem enviada:** _(fonte: whatsapp-flow.ts, linha 1803)_
```
✅ *Agendamento confirmado!*

Seu atendimento está reservado na Garagem do Ka.

📍 Endereço: *Rua das Oficinas, 100 - São Paulo, SP*
🕒 Horário: *Segunda a sábado, 08:00 às 18:00*

Cancelamentos com até 2h de antecedência sem custo.

Posso te ajudar com mais alguma coisa? 😊
```

---

## ⚠️ Fluxos Especiais

### Cliente Indeciso

**Solicitação do veículo:** _(fonte: whatsapp-flow-messages.ts, linha 323)_
```
Sem problema — vou te ajudar a descobrir o melhor! 😊

Qual o *modelo* do seu veículo?
_Ex: Civic, Hilux, Onix — ou *Civic 2021*_
```

**Solicitação do problema:** _(fonte: whatsapp-flow-messages.ts, linha 332)_
```
Perfeito 🚗

O que está acontecendo?

*1* 🎨 Pintura opaca, riscada ou sem brilho
*2* 🪑 Interior com cheiro ruim ou muito sujo
*3* 🛡️ Quero proteger um carro novo ou recém-comprado
*4* ✨ Quero um cuidado geral completo
*5* 🔧 Outro problema
```

---

### Retorno após Inatividade (STALE_RETURN)

**Comportamento:** _(fonte: whatsapp-flow.ts, linha 813)_
- Se o cliente tiver nome válido salvo: vai direto para o menu principal
- Se não tiver nome válido: reinicia do zero pedindo o nome

**Não existe menu "1 Sim, continua! / 2 Quero começar do zero"** — o código decide automaticamente.

---

### Opção Inválida

**Mensagem enviada:** _(fonte: whatsapp-flow-messages.ts, linha 347)_
```
Ops, essa opção não existe 😅

Escolhe uma dessas:

[Menu de opções novamente]
```

---

## 🤖 Mensagens Automáticas

### Lembrete 4h antes
```
⏰ *Lembrete — [Nome da empresa]*

Olá, *[Nome]*!

Seu agendamento é *hoje*:
🔧 *[Serviço]* (~[Duração])
📅 [Data] às *[Horário]*
[Endereço]

Responda *CONFIRME* para garantir seu horário ✅
```

### Aviso 30min antes
```
⚠️ *Confirmação urgente*

Olá, *[Nome]*! Seu agendamento de *[Serviço]* é às *[Horário]*.

Responda *CONFIRME* agora — sem confirmação, o horário pode ser liberado.
```

### Cancelamento automático
```
Olá, *[Nome]*!

Seu agendamento foi *cancelado*:
📅 [Data] às [Horário]
🔧 [Serviço]

[Motivo do cancelamento]

Para reagendar, envie *menu* aqui no WhatsApp 😊
```

### Agradecimento pós-serviço
```
Olá, *[Nome]*! ✨

Obrigado por confiar na *[Nome da empresa]*!

Seu serviço *[Serviço]* foi concluído com sucesso 🚗

Foi um prazer cuidar do seu veículo. Esperamos você em breve!
```

---

## ⚠️ Itens a Confirmar

### Texto Alternativo de Pickup
⚠️ **A CONFIRMAR — arquivo fonte não localizado:** Texto "1 Deixe eu levo até a estética / 2 A estética vai buscar o carro" visto em teste real não bate com o texto atual do código.

---

## 📝 Observações

- Todas as mensagens podem ser personalizadas através do sistema de prompts (`bot-prompts.ts`)
- Valores, horários e endereços são preenchidos dinamicamente
- O fluxo pode variar dependendo das configurações do estabelecimento
- Clientes podem digitar "menu" a qualquer momento para voltar ao início
- O sistema aceita variações linguísticas e sinônimos nas respostas

---

## 🖼️ Geração de Imagens

O sistema gera automaticamente 3 tipos de imagens durante o fluxo:

### 1. Calendário de Disponibilidade
- **Formato:** SVG com base64 (data URL)
- **Conteúdo:** Calendário mensal com cores indicando ocupação
- **Função:** `generateCalendarImage()` via `calendar-core.ts`
- **Cores:** 🟢 Vazio | 🟡 Médio | 🔴 Cheio | 🚫 Fechado

### 2. QR Code PIX
- **Formato:** PNG com base64 (data URL)
- **Conteúdo:** QR Code escaneável para pagamento PIX
- **Função:** `generatePixQrCode()` via `pix-qr.ts`
- **Fallback:** Placeholder se houver erro na geração

### 3. Cartão de Resumo
- **Formato:** SVG com base64 (data URL)
- **Conteúdo:** Card visual com logo, dados do agendamento e valor total
- **Função:** `generateSummaryCard()` via `summary-card.ts`
- **Design:** Fundo gradiente, ícones SVG, destaque para valor total

### Correções Realizadas

**Problema identificado:** As imagens eram geradas como data URLs (base64) mas a função `sendMedia` não estava preparada para lidar com este formato.

**Solução aplicada:** Atualização da função `resolveMediaUrl()` em `evolution-api.ts` para:
1. Reconhecer data URLs (`data:image/...`) e retorná-las como estão
2. Manter suporte a URLs absolutas (http/https)
3. Continuar convertendo URLs relativas para absolutas

**Resultado:** Agora todas as imagens (calendário, QR Code, resumo) são enviadas corretamente via WhatsApp.
