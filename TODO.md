# TODO — Correções Garagem do Ka (fluxo WhatsApp + modo teste)

## Objetivo
- Corrigir regressões críticas no fluxo do chatbot Garagem do Ka:
  - validação de nome funcionando de fato
  - parsing/coleção/confirm do veículo sem campos quebrados
  - eliminar duplicação da mensagem do veículo
  - ordem correta das etapas (foto → cupom → orçamento)
  - implementar calendário visual de verdade (nunca lista numérica)
  - upsell leve após confirmação do veículo
  - garantir consistência entre modo teste e WhatsApp oficial
  - adicionar/ajustar testes com asserts fortes

## Passos
- [ ] 1) Investigar divergência entre `whatsapp-flow.ts` e `test-bot-processor.ts` (onde a lógica é duplicada e onde as etapas se embaralham)
- [ ] 2) Unificar helpers comuns (validação nome, parsing veículo campos, mensagens/estágios, orçamento discriminado, calendário/slots)
- [ ] 3) Corrigir modo teste: ordem etapas + remover duplicação do veículo
- [ ] 4) Corrigir modo teste: parsing/confirm do veículo e permitir reedição por campos
- [ ] 5) Corrigir modo teste: upsell após confirmação do veículo e refletir no orçamento discriminado
- [ ] 6) Corrigir modo teste: implementar calendário visual (dia do mês) e validações
- [ ] 7) Garantir no fluxo oficial que orçamento/etapas não reintroduzem bug (veículo aparecendo 2x, cupom antes de foto etc.)
- [ ] 8) Atualizar/criar teste `flow-validation.test.ts` (ou suíte equivalente) simulando cenário completo e falhando/passando conforme asserts
- [ ] 9) Rodar testes e reexecutar cenário de transcript para comparar saída

