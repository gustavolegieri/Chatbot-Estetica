# TODO - Fidelidade e Cupons (Chatbot-Estetica)

- [ ] Entender como o fluxo de agendamento calcula e registra o valor (quoteMin/quoteMax e financeiroRecord).
- [ ] Definir como o chat vai detectar um cupom no texto do cliente (ex: "cupom ABC", "tenho o AA").
- [ ] Adicionar um novo estágio/snapshot no `FlowState` para capturar cupom antes do pagamento.
- [ ] Integrar com a API existente de resgate (`/api/coupons/redeem`) ou chamar `redeemCoupon` diretamente via lib.
- [ ] Calcular o desconto no valor exibido e registrado no financeiro: atualizar `flow.quoteMin/flow.quoteMax` ao aplicar cupom.
- [ ] Registrar no banco a relação do cupom com o agendamento (couponRedemption com appointmentId).
- [ ] Ajustar a confirmação final (ETAPA9) para informar o cupom e valor com desconto.
- [ ] Validar cenários: cupom inválido/expirado/limites/uso por cliente e resposta no chat.
- [ ] Rodar testes locais/compilação do projeto (build) para garantir que TypeScript passa.

