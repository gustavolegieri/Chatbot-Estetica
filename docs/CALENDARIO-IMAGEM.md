# Calendário de Agendamento com Imagem

## Visão Geral

O calendário de agendamento foi aprimorado para usar uma imagem visual gerada dinamicamente em vez de texto simples com emojis. Isso proporciona uma experiência muito mais profissional e intuitiva para os usuários.

## Funcionalidades

### Visual do Calendário

- **Imagem gerada dinamicamente**: O calendário é gerado como uma imagem PNG usando `@napi-rs/canvas`
- **Dados reais de ocupação**: As cores refletem a ocupação real de agendamentos no banco de dados
- **Layout profissional**: Cabeçalho com logo, nome do mês/ano, dias da semana e grade organizada
- **Destaque visual melhorado**:
  - 🟢 **Verde claro**: Dias com pouca ocupação (≤30%) - fundo verde claro + badge verde
  - 🟡 **Amarelo claro**: Dias com ocupação média (≤70%) - fundo amarelo claro + badge amarelo
  - 🔴 **Vermelho claro**: Dias com alta ocupação (>70%) - fundo vermelho claro + badge vermelho
  - 🔵 **Azul claro**: Dia atual (fundo azul + borda azul grossa)
  - ⬜ **Cinza claro**: Domingos (fechado) - fundo cinza + X vermelho indicando fechado
  - ⬛ **Cinza médio**: Dias passados (não selecionáveis)

### Legenda Visual

O calendário inclui uma legenda clara no rodapé com:
- Bolinhas coloridas + texto explicativo
- Layout horizontal organizado
- Cores consistentes com a grade do calendário

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

## Melhorias Visuais Implementadas

### Layout Aprimorado

1. **Cabeçalho Profissional**:
   - Logo da estética posicionada no topo esquerdo
   - Nome do mês e ano em destaque (28px, bold) no topo direito
   - Espaçamento adequado entre logo e grade

2. **Dias da Semana**:
   - Nomes abreviados (Dom, Seg, Ter, Qua, Qui, Sex, Sáb)
   - Alinhados centralmente acima das colunas
   - Domingo destacado em vermelho para indicar fechado
   - Fonte bold 14px para melhor legibilidade

3. **Grade do Calendário**:
   - Células maiores (85x85px) para melhor visualização
   - Números dos dias em 22px bold, bem legíveis
   - Bordas sutis entre células
   - Fundo colorido conforme disponibilidade

4. **Sistema de Cores**:
   - **Verde claro (#dcfce7)**: Dias livres com badge verde (#22c55e)
   - **Amarelo claro (#fef9c3)**: Dias com ocupação média com badge amarelo (#eab308)
   - **Vermelho claro (#fee2e2)**: Dias cheios com badge vermelho (#ef4444)
   - **Azul claro (#dbeafe)**: Dia atual com borda azul grossa (#3b82f6)
   - **Cinza claro (#f8fafc)**: Domingos fechados com X vermelho
   - **Cinza médio (#f1f5f9)**: Dias passados

5. **Indicadores de Disponibilidade**:
   - Badges coloridos no canto superior direito de cada célula
   - Borda branca ao redor dos badges para contraste
   - Tamanho de 8px para visibilidade clara

6. **Destaque do Dia Atual**:
   - Fundo azul claro (#dbeafe)
   - Borda azul grossa (4px) ao redor da célula
   - Número do dia em destaque

7. **Indicação de Domingos Fechados**:
   - Fundo cinza muito claro (#f8fafc)
   - X vermelho desenhado no centro da célula
   - Número do dia em cinza (#94a3b8)

8. **Legenda no Rodapé**:
   - Layout horizontal organizado
   - Bolinhas coloridas com texto ao lado
   - Cores consistentes com a grade
   - Fonte bold 13px para legibilidade

### Correções de Bugs

1. **Números dos Dias Aparecendo**:
   - Aumentado tamanho da fonte de 16px para 22px
   - Cores de texto ajustadas para contraste adequado
   - Texto desenhado após o fundo da célula (ordem correta)
   - Cores de texto: preto (#1e293b) para dias ativos, cinza para fechados/passados

2. **Alinhamento de Elementos**:
   - Dias da semana centralizados nas colunas
   - Números dos dias centralizados nas células
   - Legenda alinhada horizontalmente no rodapé

### Paleta de Cores

As cores foram escolhidas para:
- Ser suaves e profissionais
- Proporcionar bom contraste
- Ser consistentes com identidade visual moderna
- Funcionar bem em diferentes dispositivos

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

O calendário com imagem foi completamente redesenhado para corrigir os problemas visuais e proporcionar uma experiência muito mais profissional. Os números dos dias agora aparecem claramente, o layout está organizado com cabeçalho profissional, dias da semana alinhados, e uma legenda legível. As cores de disponibilidade são claras e consistentes, e o dia atual se destaca visualmente. A adição do suporte a data customizada no test-bot permite testar o calendário em qualquer situação, independentemente da data atual.