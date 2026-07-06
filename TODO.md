# TODO — Correções Garagem do Ka (fluxo WhatsApp + modo teste)

## Diagnóstico da Causa Raiz
O `test-bot-processor.ts` é uma implementação **completamente independente** do `whatsapp-flow.ts`, com:
- Tipos de estado diferentes (TestSession vs FlowState)
- Lógica de validação duplicada
- Ordem de etapas diferente
- Sem etapa de confirmação de veículo
- Sem upsell na posição correta
- Orçamento aparecendo antes do cupom
- Calendário em lista numérica em vez de visual

## Passos
- [x] 1) Diagnosticar divergência entre `whatsapp-flow.ts` e `test-bot-processor.ts`
- [ ] 2) Reescrever `test-bot-processor.ts` com ordem correta de etapas e compartilhando validações
- [ ] 3) Adicionar etapa de confirmação de veículo (ETAPA4_VEHICLE_CONFIRM)
- [ ] 4) Mover upsell para depois da confirmação do veículo
- [ ] 5) Orçamento consolidado só depois do cupom
- [ ] 6) Implementar calendário visual no modo teste
- [ ] 7) Adicionar etapa de lembrete WhatsApp
- [ ] 8) Adicionar política de cancelamento na confirmação final
- [ ] 9) Atualizar `flow-transcript.test.ts` com asserts mais fortes
- [ ] 10) Rodar testes e verificar transcript
