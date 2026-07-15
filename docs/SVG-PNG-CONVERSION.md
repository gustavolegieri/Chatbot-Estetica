# Conversão de SVG para PNG e Envio via WasenderAPI

## Visão Geral

Esta implementação resolve o problema do WhatsApp não renderizar SVG como imagem inline, convertendo automaticamente arquivos SVG de calendário para PNG em alta resolução antes do envio via WasenderAPI.

## Funcionalidades Implementadas

### 1. Conversão SVG → PNG usando Sharp
- **Biblioteca**: `sharp` para processamento de imagem de alta performance
- **Resolução**: 1080px de largura (ideal para WhatsApp)
- **Qualidade**: 90% (compressão PNG)
- **DPI**: 300 (alta qualidade para texto legível)

### 2. Upload Automático para Diretório Público
- **Diretório**: `public/tmp/` (criado automaticamente se não existir)
- **Nomenclatura**: `calendar-YYYY-MM-timestamp.png` (evita conflitos)
- **URL Pública**: Retorna URL relativa acessível via `NEXT_PUBLIC_APP_URL`

### 3. Integração com WasenderAPI
- **Fallback**: Se a conversão falhar, usa SVG original
- **Tratamento de Erros**: Logs detalhados para debug
- **Compatibilidade**: Funciona com plano gratuito e pago da WasenderAPI

## Arquivos Modificados

### 1. `src/lib/calendar-converter.ts`
**Melhorias realizadas:**
- Substituído upload base64 por salvamento no diretório público
- Nova função `convertAndUploadCalendar()` para processo completo
- Removida função `sendImageViaWasender()` (uso de `evolution-api.ts`)
- Melhorado `uploadPngToStorage()` para salvar arquivos localmente

### 2. `src/lib/calendar-helper.ts`
**Melhorias realizadas:**
- Integrado `convertAndUploadCalendar()` no fluxo de envio
- Adicionado nome de arquivo único baseado em data
- Melhorados logs para rastrear processo de conversão
- Mantido fallback para SVG em caso de falha

### 3. `package.json`
**Dependência adicionada:**
- `sharp: ^0.34.5` - Processamento de imagem

## Scripts de Teste

### Teste Isolado de Conversão
```bash
npx tsx test-svg-to-png.ts
```

**Funcionalidades:**
- Testa apenas conversão SVG→PNG
- Salva arquivo localmente para inspeção
- Não envia via WhatsApp
- Ideal para debug de problemas de conversão

### Teste Completo com Envio
```bash
npx tsx test-calendar-image.ts
```

**Funcionalidades:**
- Testa conversão SVG→PNG
- Salva no diretório público
- Envia via WasenderAPI
- Requer `WASENDER_API_KEY` configurada

## Como Usar

### No WhatsApp Flow (Produção)

A função `sendCalendarWithImageAndList()` já está atualizada e funciona automaticamente:

```typescript
import { sendCalendarWithImageAndList } from "./calendar-helper";

// Envia calendário com imagem PNG convertida
await sendCalendarWithImageAndList({ number: msg.phone, prompts });
```

**Processo automático:**
1. Gera SVG do calendário com dados reais de ocupação
2. Converte SVG para PNG (1080px largura)
3. Salva PNG em `public/tmp/`
4. Envia via WasenderAPI usando URL pública
5. Fallback para SVG se conversão falhar

### No Test Bot (Admin)

Para testar com data customizada:

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

### Uso Direto das Funções

#### Conversão e Upload
```typescript
import { convertAndUploadCalendar } from "./calendar-converter";

const result = await convertAndUploadCalendar(svgString, "calendar.png", {
  width: 1080,
  quality: 90
});

if (result.success) {
  console.log("URL pública:", result.url);
  console.log("Passos:", result.steps);
}
```

#### Conversão Isolada
```typescript
import { convertSvgToPng, savePngLocally } from "./calendar-converter";

const result = await convertSvgToPng(svgString, {
  width: 1080,
  quality: 90
});

if (result.success && result.pngBuffer) {
  await savePngLocally(result.pngBuffer, "output.png");
}
```

## Configuração Necessária

### Variáveis de Ambiente

```env
# URL pública da aplicação (para gerar URLs acessíveis)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# WasenderAPI (para envio via WhatsApp)
WASENDER_API_KEY=sua-chave-wasender-api
```

### Diretório Público

O diretório `public/tmp/` é criado automaticamente, mas certifique-se de:

1. **Permissões de escrita**: O processo Node.js deve ter permissão para criar arquivos
2. **Deploy no Vercel**: O diretório `public/` é automaticamente servido como estático
3. **Limpeza**: Considere implementar limpeza periódica de arquivos antigos

## Tratamento de Erros

### Falha na Conversão SVG→PNG
**Sintoma:** Log mostra erro de conversão
**Solução:** Sistema usa SVG original como fallback
**Log:** `[Calendar] Conversão falhou, usando SVG: [erro]`

### Falha no Upload
**Sintoma:** Erro ao salvar arquivo em `public/tmp/`
**Solução:** Verifique permissões do diretório
**Log:** `[Upload] Erro no upload: [erro]`

### Falha no Envio WasenderAPI
**Sintoma:** Erro ao enviar mensagem
**Solução:** Sistema envia legenda em texto como fallback
**Log:** `[Calendar] Falha ao enviar imagem, usando fallback de texto`

## Exemplo de Output de Teste

```
🧪 Testando conversão de calendário SVG para PNG...

📅 Passo 1: Gerando SVG do calendário...
✅ SVG gerado com sucesso: data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTc0IiBoZWlnaHQ9IjY4OCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLz...

📝 Passo 2: Extraindo SVG da data URL...
✅ SVG extraído, tamanho: 327914 bytes

🖼️  Passo 3: Convertendo SVG para PNG e salvando no diretório público...
[SVG Converter] Iniciando conversão SVG para PNG...
[SVG Converter] Tamanho do SVG: 327914 bytes
[SVG Converter] Largura alvo: 1080 px
[SVG Converter] Conversão concluída com sucesso
[SVG Converter] Tamanho do PNG: 39042 bytes
[Upload] PNG salvo em: C:\Users\legie\Desktop\chatbot-estetica\Chatbot-Estetica\public\tmp\test-calendar-2026-07-1784117520358.png
[Upload] URL pública gerada: /tmp/test-calendar-2026-07-1784117520358.png
✅ Conversão bem-sucedida!
📁 URL pública: /tmp/test-calendar-2026-07-1784117520358.png
📋 Passos executados: Iniciando conversão SVG para PNG...
✅ SVG convertido para PNG com sucesso
Salvando PNG no diretório público...
✅ Upload realizado com sucesso

📱 Passo 4: Testando envio via WasenderAPI...
📞 Para: 5511944400696
✅ Envio bem-sucedido!
📊 Resultado: {
  "success": true,
  "data": {
    "msgId": 63600082,
    "jid": "+5511944400696",
    "status": "in_progress"
  }
}

✅ Teste concluído
```

## Benefícios da Implementação

### 1. Compatibilidade com WhatsApp
- PNG é nativamente suportado pelo WhatsApp
- Evita problemas de renderização de SVG
- Melhor qualidade de visualização

### 2. Performance
- Imagens PNG são mais leves que SVG complexos
- Carregamento mais rápido no WhatsApp
- Menor uso de dados para usuários

### 3. Confiabilidade
- Fallback automático para SVG em caso de falha
- Tratamento robusto de erros
- Logs detalhados para debug

### 4. Flexibilidade
- Funciona com plano gratuito e pago da WasenderAPI
- Configuração ajustável de resolução e qualidade
- Integração transparente com fluxo existente

## Troubleshooting

### Problema: Sharp não está instalado
**Solução:**
```bash
npm install sharp
```

### Problema: Diretório public/tmp não tem permissões
**Solução:**
```bash
# Linux/Mac
chmod 755 public/tmp

# Windows (PowerShell)
icacls "public\tmp" /grant Users:F
```

### Problema: WASENDER_API_KEY não configurada
**Solução:**
Adicione ao arquivo `.env`:
```env
WASENDER_API_KEY=sua-chave-aqui
```

### Problema: NEXT_PUBLIC_APP_URL não configurada
**Solução:**
Adicione ao arquivo `.env`:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Para produção:
NEXT_PUBLIC_APP_URL=https://seu-dominio.com
```

## Melhorias Futuras

Possíveis melhorias para implementação:

- [ ] Cache de imagens geradas para evitar regeneração
- [ ] Limpeza automática de arquivos antigos em `public/tmp/`
- [ ] Suporte a diferentes resoluções para diferentes dispositivos
- [ ] Compressão adicional para reduzir tamanho de arquivo
- [ ] Métricas de performance para monitorar tempo de conversão

## Conclusão

A implementação resolve completamente o problema do WhatsApp não renderizar SVG, fornecendo uma solução robusta com fallback automático, tratamento de erros e integração transparente com o sistema existente. Os scripts de teste permitem validar cada etapa do processo isoladamente, facilitando debug e manutenção.