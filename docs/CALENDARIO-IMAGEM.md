# Calendário de Agendamento com Imagem

## Visão Geral

O calendário de agendamento foi aprimorado para usar uma imagem visual gerada dinamicamente em vez de texto simples com emojis. Isso proporciona uma experiência muito mais profissional e intuitiva para os usuários.

## Funcionalidades

### Visual do Calendário

- **Imagem gerada dinamicamente**: O calendário é gerado como uma imagem PNG usando `@napi-rs/canvas`
- **Dados reais de ocupação**: As cores refletem a ocupação real de agendamentos no banco de dados
- **Destaque visual**:
  - 🟢 **Verde**: Dias com pouca ocupação (≤30%)
  - 🟡 **Amarelo**: Dias com ocupação média (≤70%)
  - 🔴 **Vermelho**: Dias com alta ocupação (>70%)
  - 🔵 **Azul**: Dia atual (destacado com borda)
  - ⛔ **Cinza**: Domingos (fechado)

### Legenda Explicativa

Após a imagem, é exibido um texto explicativo com:
- Legenda das cores de disponibilidade
- Aviso sobre domingos fechados
- Destaque do dia atual
- Instruções de uso (digitar o número do dia)
- Opção de voltar ao menu (digitar 0)

## Implementação

### WhatsApp Flow Oficial

No fluxo oficial do WhatsApp (`whatsapp-flow.ts`):

1. **Envio da imagem**: A função `sendCalendarWithImageAndList()` envia a imagem do calendário
2. **Envio da legenda**: A função `generateCalendarLegend()` envia o texto explicativo
3. **Dados reais**: A ocupação é calculada a partir dos agendamentos existentes no banco

### Test Bot do Painel Admin

No test-bot (`test-bot-processor.ts`):

1. **Geração da imagem**: A função `generateCalendarImageOnlyForTest()` gera a imagem sem enviar
2. **Retorno como mediaUrl**: A URL da imagem é retornada na resposta para exibição no chat
3. **Legenda incluída**: O texto explicativo é incluído na mesma resposta
4. **Suporte a data customizada**: O test-bot aceita uma data customizada para testes

## Configurações Necessárias

### Variáveis de Ambiente

```env
# URL pública do aplicativo (para gerar URLs acessíveis das imagens)
NEXT_PUBLIC_APP_URL=https://seu-dominio.com

# Alternativa para Vercel
VERCEL_URL=seu-projeto.vercel.app
```

### Dependências

As seguintes dependências já estão incluídas no projeto:

```json
{
  "@napi-rs/canvas": "^0.1.55",
  "date-fns": "^3.6.0"
}
```

### Diretório Público

O diretório `public/tmp/` é criado automaticamente para armazenar as imagens geradas. Este diretório é acessível publicamente através da URL do aplicativo.

## Fluxo do Usuário

### WhatsApp Flow

1. Usuário chega na etapa de escolha de data
2. Bot envia imagem do calendário do mês atual
3. Bot envia legenda explicativa
4. Usuário digita o número do dia desejado
5. Bot prossegue para escolha de horário

### Test Bot

1. Usuário chega na etapa de escolha de data
2. Bot exibe imagem do calendário no chat
3. Bot exibe legenda explicativa
4. Usuário digita o número do dia desejado
5. Bot prossegue para escolha de horário

## Test Bot com Data Customizada

### Funcionalidade

O Test Bot do painel admin agora permite simular datas diferentes da data atual. Isso é especialmente útil quando:
- Hoje é domingo e você precisa testar o calendário
- Você quer testar comportamento em datas específicas
- Você precisa simular situações futuras ou passadas

### Como Usar

1. Acesse a página de Test Bot em `/admin/teste`
2. No topo da página, você verá dois campos de simulação:
   - **📅 Seletor de Data**: Escolha a data que deseja simular
   - **⏰ Seletor de Horário**: Escolha o horário que deseja simular
3. Selecione a data desejada (ex: uma segunda-feira)
4. Clique em "Reiniciar" para aplicar a nova data
5. O calendário será gerado considerando a data simulada

### Exemplo Prático

Se hoje é domingo e você quer testar o calendário:
1. Selecione no seletor de data: `2026-07-14` (uma segunda-feira)
2. Clique em "Reiniciar"
3. Siga o fluxo até o calendário
4. O calendário mostrará o mês de julho com 14/07 destacado como "hoje"
5. Domingos aparecerão como fechados, mas você poderá selecionar dias úteis

### Detalhes Técnicos

- A data customizada é enviada via `testDate` no formato `YYYY-MM-DD`
- O calendário usa essa data como referência para cálculo de ocupação
- O dia atual (destaque azul) será a data simulada
- A lógica de domingos fechados continua funcionando normalmente

## Regras de Negócio Mantidas

- ✅ Domingos aparecem como fechados/indisponíveis
- ✅ O dia atual está destacado visualmente (borda azul)
- ✅ 3 níveis de disponibilidade visualmente claros
- ✅ Usuário pode voltar ao início (digite 0)
- ✅ Dados de ocupação baseados em agendamentos reais
- ✅ Funciona com data customizada no test-bot

## Troubleshooting

### Imagem não aparece no WhatsApp

- Verifique se `NEXT_PUBLIC_APP_URL` está configurado corretamente
- Verifique se o diretório `public/tmp/` existe e tem permissões de escrita
- Verifique se a biblioteca `@napi-rs/canvas` está instalada

### Imagem não aparece no Test Bot

- Verifique se a URL retornada por `generateCalendarImageOnlyForTest()` é acessível
- Verifique se o componente do test-bot está renderizando imagens corretamente
- Verifique o console do navegador para erros de carregamento de imagem

### Data customizada não funciona no Test Bot

- Verifique se o formato da data está correto: `YYYY-MM-DD`
- Certifique-se de clicar em "Reiniciar" após alterar a data
- Verifique se a data está sendo salva na sessão de teste

### Fallback para base64

Se não for possível escrever no diretório `public/tmp/`, o sistema usa automaticamente uma URL base64 como fallback. A imagem aparecerá, mas pode ser mais lenta para carregar.

## Melhorias Futuras

Possíveis melhorias para o calendário:

- [x] Suporte a data customizada no test-bot (IMPLEMENTADO)
- [ ] Suporte a navegação entre meses (anterior/próximo)
- [ ] Interação direta na imagem (clique no dia)
- [ ] Modo de exibição compacta para telas pequenas
- [ ] Personalização de cores da marca
- [ ] Cache de imagens geradas para evitar regeneração

## Exemplo de Uso

### No WhatsApp Flow

```typescript
import { sendCalendarWithImageAndList, generateCalendarLegend } from "./calendar-helper";

// Envia calendário com imagem
await sendCalendarWithImageAndList({ number: msg.phone, prompts });

// Envia legenda explicativa
await sendText({ number: msg.phone, text: generateCalendarLegend() });
```

### No Test Bot (com data customizada)

```typescript
import { generateCalendarImageOnlyForTest, generateCalendarLegend } from "./calendar-helper";

// Gera imagem com data customizada
const calendarImagePath = await generateCalendarImageOnlyForTest("2026-07-14");

// Retorna resposta com imagem e legenda
responses.push({ 
  text: generateCalendarLegend(), 
  mediaUrl: calendarImagePath, 
  mediaType: "image" 
});
```

### No Test Bot (data atual)

```typescript
import { generateCalendarImageOnlyForTest, generateCalendarLegend } from "./calendar-helper";

// Gera imagem com data atual
const calendarImagePath = await generateCalendarImageOnlyForTest(null);

// Retorna resposta com imagem e legenda
responses.push({ 
  text: generateCalendarLegend(), 
  mediaUrl: calendarImagePath, 
  mediaType: "image" 
});
```

## Conclusão

O calendário com imagem proporciona uma experiência muito mais profissional e intuitiva, mantendo todas as regras de negócio originais e funcionando tanto no WhatsApp quanto no test-bot do painel admin. A adição do suporte a data customizada no test-bot permite testar o calendário em qualquer situação, independentemente da data atual.