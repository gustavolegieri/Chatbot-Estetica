# Google Images Scraping - Implementação Técnica

## Visão Geral Técnica

Este documento descreve a implementação técnica do sistema de scraping do Google Images para buscar imagens baseadas em diagnóstico.

## Arquitetura

### Edge Function (`diagnosis-image-search`)

A edge function é o componente principal que realiza o scraping:

```
Client Request → Edge Function → Google Images → HTML Parsing → Image URLs → Client Response
                        ↓
                   Fallback (DuckDuckGo)
```

### Fluxo de Execução

1. **Recepção da Requisição:**
   - Validação dos parâmetros de entrada usando Zod
   - Extração do perfil do diagnóstico
   - Construção da query personalizada

2. **Scraping do Google Images:**
   - Requisição HTTP para `https://www.google.com/search`
   - Extração do HTML retornado
   - Parsing de múltiplos formatos de URL

3. **Processamento das URLs:**
   - Limpeza e validação
   - Aplicação de filtros
   - Seleção baseada em seed

4. **Retorno:**
   - URL da imagem selecionada
   - Metadados completos
   - Fallback se necessário

## Detalhes de Implementação

### 1. Construção da Query

```typescript
function buildQueryFromDiagnosis(params) {
  // Extrai estilo, paleta, cor, tecido do diagnóstico
  const estiloFragment = ESTILO_MAP[estiloPersonalidade];
  const paletaFragment = PALETA_COLOR_MAP[paletaPsicometrica];
  const colorFragment = extrairCorPreferida();
  const fabricFragment = extrairTecidoPreferido();
  
  // Combina fragmentos
  return `${estiloFragment} ${paletaFragment} ${colorFragment} ${fabricFragment} women fashion ${section} ${mode}`;
}
```

### 2. Requisição HTTP

```typescript
const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=isch&tbs=itp:photo,ift:jpg&hl=pt-BR&safe=active`;

const response = await fetch(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://www.google.com/',
  },
});
```

### 3. Extração de URLs

#### Abordagem 1: Regex Direto

```typescript
const directUrlPatterns = [
  /\"https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp)\"/gi,
  /src=\"(https?:\/\/[^\"]+)\"/gi,
  /data-src=\"(https?:\/\/[^\"]+)\"/gi,
  /href=\"(https?:\/\/[^\"]+)\"/gi,
];
```

#### Abordagem 2: JSON Embutido

```typescript
const jsonPatterns = [
  /\"url\":\s*\"(https?:\\/\\/[^"]+)\"/gi,
  /\"ou\":\s*\"(https?:\\/\\/[^"]+)\"/gi,
  /\[\"(https?:\\?\\/\\?/[^\"]+)\"\]/gi,
];
```

#### Abordagem 3: Base64

```typescript
const base64Pattern = /data:image\/(?:jpg|jpeg|png|webp);base64,[a-zA-Z0-9\/+=]+/gi;
```

### 4. Filtragem

```typescript
// Filtro de domínios bloqueados
const blockedDomains = [
  'shutterstock', 'gettyimages', 'istock', 'dreamstime', 'alamy',
  'depositphotos', 'adobe stock', 'bigstock', 'fotolia', 'vectorstock',
  'stocksy', 'freepik', '123rf', 'agefotostock', 'picfair', 'mostphotos',
  'googleusercontent', 'gstatic'
];

// Filtro de termos de exclusão
const excludeTerms = ['man', 'men', 'male', 'boy', 'child', 'kid', 'baby', ...];

// Validação de URL
if (url.length < 20 || url.length > 500) continue;
if (!url.match(/^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i)) continue;
```

### 5. Sistema de Fallback

```typescript
async function fetchGoogleImagesAlternative(query, seed, excludeTerms) {
  // Usa DuckDuckGo Images como alternativa
  const vqd = await getVQDToken(query);
  const results = await fetchDuckDuckGoImages(query, vqd);
  return processResults(results, seed, excludeTerms);
}
```

## Limitações e Desafios

### 1. Proteções do Google

O Google implementa várias proteções contra scraping:

- **User-Agent Detection:** Bloqueia User-Agents suspeitos
- **Rate Limiting:** Limita requisições frequentes do mesmo IP
- **CAPTCHA:** Exige CAPTCHA em casos de atividade suspeita
- **JavaScript Rendering:** Algumas imagens só carregam com JavaScript
- **Cookie Tracking:** Rastreia sessões para detectar automação

### 2. Estrutura do HTML

O HTML do Google Images:
- **Muda frequentemente:** Google atualiza a estrutura regularmente
- **Obfuscado:** Nomes de classes e IDs são ofuscados
- **JavaScript-heavy:** Muito conteúdo é renderizado via JavaScript
- **Responsivo:** Estrutura diferente para diferentes user-agents

### 3. Performance

- **Latência:** Scraping é mais lento que APIs diretas
- **Parsing:** Extração de HTML é computacionalmente intensivo
- **Network:** Requer múltiplas requisições em alguns casos
- **Memory:** Processamento de HTML grande consome memória

## Estratégias de Mitigação

### 1. User-Agent Fixo Realista

Usa um User-Agent moderno e realista para evitar detecção:

```typescript
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
```

### 2. Múltiplas Abordagens de Extração

Implementa 3 abordagens diferentes para extrair URLs:
- Regex direto para URLs explícitas
- Parsing de JSON embutido
- Extração de base64

### 3. Fallback Robusto

Se o scraping direto falhar:
- Usa DuckDuckGo Images automaticamente
- Mantém a mesma lógica de filtragem
- Retorna provider "google-alt" para identificação

### 4. Filtragem Agressiva

Remove proativamente:
- Domínios de stock photos
- Termos indesejados
- URLs suspeitas
- Imagens do próprio Google

## Melhorias Futuras Sugeridas

### 1. User-Agent Rotation

```typescript
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36...',
];

const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
```

### 2. Proxy Rotation

```typescript
const proxies = [
  'http://proxy1.example.com:8080',
  'http://proxy2.example.com:8080',
  'http://proxy3.example.com:8080',
];

const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
```

### 3. Google Custom Search API

```typescript
// Alternativa oficial e mais confiável
const apiKey = Deno.env.get('GOOGLE_CUSTOM_SEARCH_API_KEY');
const cx = Deno.env.get('GOOGLE_CUSTOM_SEARCH_CX');

const response = await fetch(
  `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${query}&searchType=image`
);
```

### 4. CAPTCHA Handling

```typescript
// Integração com serviços como 2Captcha
if (response.includes('captcha')) {
  const solution = await solveCAPTCHA(captchaSiteKey);
  // Retry com solução do CAPTCHA
}
```

### 5. Cache Inteligente

```typescript
// Cache por assinatura de diagnóstico
const cacheKey = `${diagnosisId}:${section}:${signature}`;
const cached = await cache.get(cacheKey);

if (cached) {
  return cached;
}

// Processa e cacheia resultado
const result = await fetchGoogleImages(...);
await cache.set(cacheKey, result, { ttl: 3600 });
```

## Monitoramento e Debugging

### Logs Implementados

```typescript
console.log(`[google-images] Iniciando busca para query: "${query}"`);
console.log(`[google-images] Encontradas ${uniqueUrls.length} URLs brutas`);
console.log(`[google-images] ${candidates.length} URLs após filtros`);
console.log(`[google-images] ✓ URL selecionada: ${selectedUrl.substring(0, 50)}...`);
console.log(`[google-images-alt] Tentando abordagem alternativa para: "${query}"`);
```

### Métricas para Monitorar

- Taxa de sucesso do scraping direto vs fallback
- Tempo médio de resposta por provider
- Quantidade de URLs extraídas por query
- Taxa de rejeição por filtros
- Erros mais comuns (HTTP, parsing, etc.)

## Conclusão

A implementação atual de Google Images scraping fornece uma solução funcional que:

1. **Funciona sem configuração:** Não requer API keys ou setup complexo
2. **Tem fallback robusto:** DuckDuckGo como alternativa confiável
3. **Usa múltiplas abordagens:** Aumenta chances de sucesso
4. **Filtra agressivamente:** Remove conteúdo indesejado
5. **É monitorável:** Logs detalhados para debugging

Apesar das limitações inerentes ao scraping do Google, a implementação atual oferece um bom equilíbrio entre funcionalidade e simplicidade, com caminhos claros para melhorias futuras se necessário.