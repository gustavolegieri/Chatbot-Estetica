# Upsell Inteligente - Documentação de Implementação

## Funcionalidade Implementada

### ✅ Upsell Inteligente Baseado no Veículo

Sistema que sugere serviços complementares baseados no tipo de veículo do cliente.

## Como Funciona

### 1. Detecção de Tipo de Veículo

A função `detectVehicleType()` analisa o nome/modelo do veículo informado pelo cliente:

```typescript
const vehicleType = detectVehicleType("Gol 2022");
// Retorna: { type: "hatchback", confidence: 0.9 }

const vehicleType = detectVehicleType("Toyota Corolla");
// Retorna: { type: "sedan", confidence: 0.85 }

const vehicleType = detectVehicleType("Compass");
// Retorna: { type: "suv", confidence: 0.9 }
```

### 2. Geração de Sugestões

A função `generateUpsellSuggestions()` busca serviços configurados como upsell para aquele tipo de veículo:

```typescript
const suggestions = await generateUpsellSuggestions(
  selectedServiceId,
  vehicleType
);
```

### 3. Configuração no Banco de Dados

A tabela `Service` tem novos campos para configurar upsell:

```prisma
model Service {
  // ... campos existentes
  upsellForHatchback Boolean @default(false)
  upsellForSedan   Boolean @default(false)
  upsellForSuv     Boolean @default(false)
  upsellForPickup  Boolean @default(false)
  upsellDiscount   Decimal? @db.Decimal(10, 2)
}
```

### 4. Exemplo de Uso

```typescript
import { detectVehicleType, generateUpsellSuggestions, formatUpsellMessage } from "./upsell-engine";

// Após cliente informar veículo
const vehicleType = detectVehicleType(vehicleName);
const suggestions = await generateUpsellSuggestions(selectedServiceId, vehicleType);

if (suggestions.length > 0) {
  const message = formatUpsellMessage(suggestions, vehicleName);
  await sendText({ number: phoneNumber, text: message });
}
```

### 5. Exemplo de Mensagem Gerada

```
✨ Sugestões para seu Gol 2022

1. Proteção de Faróis
   Para hatchbacks, este serviço complementa perfeitamente o detalhamento.
   💰 R$ 80,00 (era R$ 100,00)
   ✨ Protege contra raios UV e danos

2. Polimento de Pneus
   Este serviço adiciona valor e proteção ao seu veículo.
   💰 R$ 60,00
   ✨ Melhora aparência e durabilidade

Adicione um desses serviços ao seu agendamento?
Responda com o número da opção desejada.
```

## ⚠️ Botões Interativos (NÃO Implementado)

### Por que não foi implementado?

A **WasenderAPI NÃO suporta botões interativos nativos** do WhatsApp (interactive buttons).

**O que a WasenderAPI suporta:**
- ✅ Texto, imagem, vídeo, áudio, documento
- ✅ Polls (enquetes)
- ✅ Location, contact cards
- ❌ **Botões interativos (NOT supported)**

**Diferença entre Polls e Botões:**
- **Polls**: São enquetes onde o usuário vota em opções (multi-select ou single-select)
- **Botões Interativos**: São botões clicáveis nativos do WhatsApp (até 3 opções, com IDs customizados)

### Alternativas

1. **Manter texto numerado (1, 2, 3)** - Implementado atualmente
2. **Mudar para API que suporta botões** (ex: Twilio, MessageBird)
3. **Usar polls como alternativa** - NÃO recomendado (UX diferente)

### Documentação WasenderAPI

Verifique: https://wasenderapi.com/api-docs/messages

Não há endpoint para "interactive buttons" ou "reply buttons" na documentação oficial.

## Próximos Passos

Para implementar botões interativos:

1. **Opção A**: Mudar para Twilio/MessageBird (suportam botões nativos)
2. **Opção B**: Aguardar WasenderAPI implementar suporte
3. **Opção C**: Usar polls (mas UX não é a mesma de botões)

## Uso Atual

Atualmente o sistema usa:
- Texto numerado (1, 2, 3) para seleções
- Funciona bem e é compatível com todas as APIs
- UX aceitável para bots de WhatsApp
