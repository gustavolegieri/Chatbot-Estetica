# FLUXO OFICIAL DO BOT — Garagem do Ka

> Este é o fluxo QUE TEM QUE SER SEGUIDO. É a fonte da verdade.
> Qualquer divergência entre o código atual (`whatsapp-flow.ts`, `whatsapp-flow-core.ts`,
> `whatsapp-flow-messages.ts`) e este documento é BUG e deve ser corrigida no código,
> não neste documento (a não ser que uma mudança de fluxo seja pedida e aprovada explicitamente).

Cada etapa abaixo corresponde a um valor de `flow.stage` (`FlowStage` em `whatsapp-flow-types.ts`).
Os textos entre `{ }` são variáveis/templates dinâmicos.

---

## 1. BOAS-VINDAS (`startFlow`)

```
Olá! Seja muito bem-vindo(a) à *{businessName}* 🚗✨

Aqui não fazemos lavagem comum — somos especialistas em *estética automotiva premium*: serviços
que cuidam, protegem e valorizam o seu veículo de verdade.

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

## 2. COLETA DE NOME — `ETAPA1_AWAITING_NAME`

- Se **greeting**: `"Olá! 😊 Para começar, qual é o seu nome?"`
- Se **dúvida**: `"{analysis.reply}\n\nPara seguir, qual é o seu nome?"`
- Se **nome não identificado**: `"Não consegui identificar seu nome 😊 Pode me dizer como posso te chamar?"`
- Se **nome válido**: → `ETAPA2_MAIN_MENU`

## 3. MENU PRINCIPAL — `ETAPA2_MAIN_MENU`

Template dinâmico `{etapa2MainMenu}` baseado nas categorias do catálogo.

- Se **recusa**: `"Sem problemas 😊\n\n{etapa2MainMenu}"`
- Se **categoria 8 (indeciso)**: pede modelo do veículo → `ETAPA3_UNDECIDED_VEHICLE`
- Se **categoria com 1 serviço só**: vai direto para o detalhe (`activateService`)
- Se **categoria com vários serviços**: mostra submenu → `ETAPA2_SUB`

## 4. SUBMENU — `ETAPA2_SUB`

- Se **voltar**: `"{etapa2MainMenu}"` → `ETAPA2_MAIN_MENU`
- Se **serviço selecionado**: → `activateService` → `ETAPA3_SERVICE_ACTION` (ou direto `ETAPA4_VEHICLE`)

## 5. CLIENTE INDECISO — VEÍCULO — `ETAPA3_UNDECIDED_VEHICLE`

- Se **veículo válido**:
```
Perfeito 🚗

O que está acontecendo?

1 🎨 Pintura opaca, riscada ou sem brilho
2 🪑 Interior com cheiro ruim ou muito sujo
3 🛡️ Quero proteger um carro novo ou recém-comprado
4 ✨ Quero um cuidado geral completo
5 🔧 Outro problema
```
→ `ETAPA3_UNDECIDED_PROBLEM`
- Se **modelo não entendido**: pede modelo novamente (permanece na etapa)
- Se **precisa de ano**: `"Anotado: {model} 👍\n\nQual o ano do veículo?"`

## 6. CLIENTE INDECISO — PROBLEMA — `ETAPA3_UNDECIDED_PROBLEM`

```
Para seu caso, recomendo *{item.label}* ✨

{serviceDetail}
```
→ `ETAPA4_VEHICLE` ou `ETAPA5_QUOTE`

## 7. AÇÕES COM PACOTES — `ETAPA3_PACKAGE_ACTION`

- **Ver outros serviços**: `"{etapa2MainMenu}"` → `ETAPA2_MAIN_MENU`
- **Comparar pacotes**:
```
📦 Pacotes: Brilho Total (R$550+) | Proteção Completa (R$900+) | Interior Premium (R$380+) | Full Detail (R$1400+)

1 📅 Agendar um pacote
2 🔍 Comparar pacotes
3 🔧 Ver serviços avulsos
```
- **Agendar**: → `ETAPA4_VEHICLE` ou `ETAPA5_QUOTE`

## 8. AÇÕES APÓS SERVIÇO — `ETAPA3_SERVICE_ACTION`

- **Ver outros serviços**: `"{etapa2MainMenu}"` → `ETAPA2_MAIN_MENU`
- **Tenho dúvida**: → `ETAPA10_FAQ`
- **Agendar**: → `ETAPA4_VEHICLE` ou `ETAPA5_QUOTE`

## 9. COLETA DE VEÍCULO — `ETAPA4_VEHICLE`

- **Confirmação (sim)**: → `ETAPA5_QUOTE`
- **Negação (não)**: `"{buildVehicleCollectionPrompt}"` (permanece coletando)
- **Dados completos, aguardando confirmação**:
```
🚘 Confirmando os dados do veículo

Modelo: {model}
Ano: {year}
Cor: {color}
Estado: {condition}

Está certo? (sim/não)
```
- **Coleta modelo** (`vehicleCollectStep = "model"`):
```
Qual é o modelo do seu veículo? 🚗

_Exemplos: Civic, Corolla, Hilux, Onix, Compass, HB20_
```
- **Coleta ano** (`vehicleCollectStep = "year"`): `"Anotado: {model} 👍\n\nQual o ano do veículo?"`

## 10. ORÇAMENTO — `ETAPA5_QUOTE`

- **Ver outros serviços**: `"{etapa2MainMenu}"` → `ETAPA2_MAIN_MENU`
- **Tenho dúvidas**: → `ETAPA10_FAQ`
- **Primeira vez, bônus disponível**:
```
🎁 Bônus! Primeira vez: 10% de desconto

É sua primeira vez aqui! Ganhou 10% de desconto no primeiro serviço.

💰 Desconto: R$ {firstTimeBonusDiscount}

1 ✅ Quero o desconto
2 ❌ Não, obrigado
```
→ `ETAPA5_FIRST_TIME_BONUS`
- **Upsell disponível (sem bônus)**:
```
✨ Que tal adicionar {upsell.complement}?

💰 R$ {upsellValue} a mais

1 - Sim, incluir
2 - Não, obrigado
```
→ `ETAPA6_UPSELL`
- **Sem upsell nem bônus**: → `ETAPA7_DAY` (calendário)

## 11. BÔNUS PRIMEIRA VEZ — `ETAPA5_FIRST_TIME_BONUS`

- **Aceitar**:
```
✅ Desconto aplicado!

Seu bônus de primeira compra foi ativado.

💰 Novo valor: R$ {quoteMin}

Vamos continuar com o agendamento?
```
- **Recusar**: `"Sem problema! Vamos continuar com o valor original.\n\n💰 Valor: R$ {quoteMin}"`
→ segue para `ETAPA6_UPSELL` (se houver) ou `ETAPA7_DAY`

## 12. UPSELL — `ETAPA6_UPSELL`

- **Aceitar**: `"✅ Incluído! {upsell.complement} adicionado ao seu agendamento."` + calendário → `ETAPA7_DAY`
- **Recusar**: calendário → `ETAPA7_DAY`

## 13. ESCOLHA DE DIA — `ETAPA7_DAY`

- Mostra calendário + legenda + opções de dias da semana disponíveis
→ `ETAPA7_TIME`

## 14. ESCOLHA DE HORÁRIO — `ETAPA7_TIME`

- Mostra horários disponíveis
- Se válido: pergunta sobre cupom → `ETAPA9_COUPON`

## 15. CUPOM — `ETAPA9_COUPON`

- **Pular**: → `ETAPA9_LOYALTY`
- **Pedir código**: `"Perfeito 😊 Me envie o código do cupom (ex: AA)."`
- **Inválido**: `"Cupom inválido ou inativo 😔"`
- **Aplicado**: `"✅ Cupom {CODE} aplicado com sucesso!"` → `ETAPA9_LOYALTY`

## 16. PONTOS DE FIDELIDADE — `ETAPA9_LOYALTY`

- **Usar pontos**: mostra orçamento com desconto
- **Não usar**: mostra orçamento sem desconto
→ `ETAPA10_BUDGET`

## 17. CONFIRMAÇÃO DE ORÇAMENTO — `ETAPA10_BUDGET`

- **Sim**:
```
🚚 Como prefere?

1 - Deixe eu levo o carro até a estética
2 - A estética vai buscar o carro
```
→ `ETAPA10_LOGISTICS`
- **Não**: `"{etapa2MainMenu}"` → `ETAPA2_MAIN_MENU`

## 18. LOGÍSTICA — `ETAPA10_LOGISTICS`

- **Cliente leva**: `"📍 Combinado! Você pode levar o carro até a loja quando puder."` + calendário
- **Estética busca**: `"🚚 Ótimo! Me envie o endereço completo onde o carro está para calcular a taxa de busca."`
- **Com devolução**: `"🔄 Devolução incluída no resumo."` + calendário
- **Sem devolução**: `"📍 Sem devolução, tudo certo."` + calendário
→ `ETAPA8_PAYMENT`

## 19. PAGAMENTO — `ETAPA8_PAYMENT`

- **PIX**: `"💸 Como você prefere pagar via PIX?\n\n1 PIX (Pagar agora)\n2 PIX (Pagar na entrega)"` → `ETAPA8_PIX_CHOICE`
- **Cartão**: pergunta débito/crédito → `ETAPA8_PAYMENT_CARD_TYPE`
- **Dinheiro**: pergunta sobre lembrete → `ETAPA14_REMINDER`

## 20. ESCOLHA PIX — `ETAPA8_PIX_CHOICE`

- **Agora**: QR Code + pedido de comprovante → `ETAPA8_RECEIPT_UPLOAD`
- **Entrega**: pergunta sobre lembrete → `ETAPA14_REMINDER`

## 21. COMPROVANTE — `ETAPA8_RECEIPT_UPLOAD`

- **Não lido**: pede novamente
- **Inválido**: informa valor esperado
- **Válido**: confirma → `ETAPA14_REMINDER`

## 22. LEMBRETE — `ETAPA14_REMINDER`

- **Sim**: configura lembrete
- **Não**: pula
→ `ETAPA15_SUMMARY_CONFIRM`

## 23. RESUMO E CONFIRMAÇÃO — `ETAPA15_SUMMARY_CONFIRM` → `ETAPA16_CONFIRMATION`

- Mostra resumo completo do agendamento
- Confirmação final → cria o agendamento (`createAppointment`)

---

## Regras que valem em QUALQUER etapa (interceptadores cross-cutting)

Estas regras rodam antes do switch principal e podem (e devem, quando corretas) interromper
a etapa atual. Se o comportamento do bot destoar do fluxo acima, verifique estas regras primeiro:

1. Se `flow.awaitingDiscountResponse` estiver ativo → resposta de desconto tem prioridade total.
2. Detecção de cancelamento/desistência → interrompe qualquer etapa.
3. Small talk / confirmação neutra ("ok", "tá", "pera aí") fora de `ETAPA1`/`ETAPA2_MAIN_MENU`/`STALE_RETURN`
   → reimprime o menu da etapa atual, sem avançar.
4. Mensagem parecendo pergunta (`looksLikeQuestion`) fora de `ETAPA10_FAQ`/`ETAPA1` → aciona IA
   (Cerebras) para responder a dúvida e depois reimprime o menu da etapa atual.
5. Veículo + serviço detectados simultaneamente no texto livre, com nome já salvo, em
   `ETAPA2_MAIN_MENU`/`ETAPA2_SUB` → pula direto para `activateService`.

**Qualquer nova funcionalidade ou correção deve considerar essas 5 regras antes de mexer no
`case` da etapa**, porque elas podem interceptar a mensagem antes de chegar lá.

## Etapas LEGACY (não usar como destino de fluxo novo)

`ETAPA7_PERIOD`, `ETAPA7_CUSTOM_DAY`, `ETAPA8_PAYMENT_NO_PIX`, `ETAPA9_REMINDER`,
`ETAPA11_SERVICE_QUESTION` — mantidas só por compatibilidade com sessões antigas salvas no banco.
