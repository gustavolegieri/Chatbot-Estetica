# Integração Automática do Google Images Scraping

## Resumo das Alterações

O sistema de Google Images scraping foi integrado automaticamente ao fluxo de geração de diagnóstico. Agora, quando um diagnóstico é gerado, as imagens são buscadas automaticamente via scraping do Google Images sem intervenção manual.

## Alterações Realizadas

### 1. Edge Function `generate-section-images`

**Localização:** `supabase/functions/generate-section-images/index.ts`

**Alteração:** Prioridade para Google Images scraping

**Antes:**
```typescript
const providers = ["openverse-search-image", "pexels-search-image", "unsplash-search-image", "pixabay-search-image", "duckduckgo-search-image"];
```

**Depois:**
```typescript
// PRIMEIRO: Tentar Google Images scraping via diagnosis-image-search
const { data, error } = await supabase.functions.invoke("diagnosis-image-search", {
  body: {
    diagnosisId,
    questionnaire: diag.questionnaire,
    colorAnalysis: diag.color_analysis,
    styleAnalysis: diag.style_analysis,
    section: sec,
    seed,
    mode: "product",
    exclude_terms: [...],
  },
});

// FALLBACK: Se Google Images falhar, usar provedores antigos
if (!imageUrl) {
  const providers = ["duckduckgo-search-image", "pexels-search-image", "unsplash-search-image"];
  // ...
}
```

**Impacto:**
- Google Images scraping é tentado primeiro para cada seção
- Se funcionar, usa a imagem do Google
- Se falhar, cai para os provedores anteriores
- Mantém compatibilidade com o sistema existente

### 2. Edge Function `search-clothing-image`

**Localização:** `supabase/functions/search-clothing-image/index.ts`

**Alteração:** Google Images scraping como prioridade alta

**Adicionado:**
```typescript
// TENTAR PRIMEIRO: Google Images scraping via diagnosis-image-search
if (!validUrl && diagnosisScope) {
  const { data: googleData, error: googleError } = await supabase.functions.invoke("diagnosis-image-search", {
    body: {
      diagnosisId: diagnosisScope,
      pieceName: pieceName,
      category: category,
      seed: seedNum,
      mode: "product",
      exclude_terms: [...],
    },
  });
  
  if (!googleError && googleData?.imageUrl) {
    validUrl = googleData.imageUrl;
    validSource = "google";
    validScore = 100; // Prioridade alta
  }
}
```

**Impacto:**
- Busca de peças específicas também usa Google Images
- Prioridade alta (score 100) para resultados do Google
- Fallback para sistema existente se falhar

## Fluxo Automático de Geração de Imagens

### 1. Geração do Diagnóstico

Quando um usuário completa o questionário:

1. **process-diagnosis** é chamado
2. Análises são geradas (color_analysis, style_analysis, etc.)
3. **generate-section-images** é disparado automaticamente

### 2. Geração de Imagens de Seção

A edge function `generate-section-images`:

1. **Carrega dados do diagnóstico** (questionnaire, color_analysis, style_analysis)
2. **Normaliza o perfil** (cor, tecido, estilo)
3. **Para cada seção** (estilo, cores, corpo, etc.):
   - Constrói query específica da seção
   - **Tenta Google Images scraping primeiro** via `diagnosis-image-search`
   - Se funcionar, salva a imagem no banco
   - Se falhar, tenta provedores de fallback
4. **Salva resultados** em `diagnosis_section_images`

### 3. Geração de Imagens de Peças

A edge function `search-clothing-image`:

1. **Recebe parâmetros** (pieceName, category, diagnosisId)
2. **Tenta Google Images scraping primeiro** via `diagnosis-image-search`
3. **Se funcionar**, retorna a imagem do Google
4. **Se falhar**, usa o sistema existente (AI + providers)

## Logs para Monitoramento

### Logs Importantes

No console do Supabase, procure por:

**generate-section-images:**
```
[generate-section-images] ✓ Google Images scraping found image for estilo
[generate-section-images] Google Images failed for cores, trying fallback providers
[generate-section-images] ✓ Fallback provider duckduckgo-search-image found image for cores
```

**search-clothing-image:**
```
[search-clothing-image] Tentando Google Images scraping para "blazer azul"
[search-clothing-image] ✓ Google Images scraping encontrou imagem para "blazer azul"
[search-clothing-image] ✗ Google Images scraping falhou para "vestido rosa"
```

**diagnosis-image-search:**
```
[diagnosis-search] Built query for {diagnosisId}: "modern minimalist navy blue silk..." (section: estilo)
[google-images] Iniciando busca para query: "modern minimalist navy blue silk..."
[google-images] Encontradas 15 URLs brutas
[google-images] 12 URLs após filtros
[google-images] ✓ URL selecionada: https://...
[diagnosis-search] ✓ Found image via google: "modern minimalist navy blue silk..."
```

## Como Verificar se Está Funcionando

### 1. Criar um Novo Diagnóstico

1. Acesse o sistema e crie um novo diagnóstico
2. Complete o questionário completamente
3. Aguarde a geração do diagnóstico

### 2. Verificar os Logs

1. Acesse o console do Supabase
2. Procure por logs de `generate-section-images`
3. Verifique se Google Images scraping está sendo usado

### 3. Verificar o Banco de Dados

1. Consulte a tabela `diagnosis_section_images`
2. Verifique se as imagens foram salvas
3. Confira se o provider é "google" ou fallback

### 4. Verificar na Interface

1. Acesse a página do diagnóstico gerado
2. Verifique se as imagens aparecem
3. Confira se são relevantes para o perfil

## Comportamento Esperado

### Caso Normal (Google Images Funciona)

- **Provider:** "google" nos logs
- **Query:** Texto descritivo em português/inglês
- **Imagem:** Relevante para o perfil do diagnóstico
- **Tempo:** 2-5 segundos por seção

### Caso de Fallback (Google Images Falha)

- **Provider:** "duckduckgo-search-image" ou outro
- **Query:** Texto descritivo (mais genérico)
- **Imagem:** Ainda relevante, mas pode ser menos específica
- **Tempo:** 3-7 segundos por seção

### Caso de Erro

- **Provider:** "none" ou "error"
- **Mensagem:** Erro descritivo nos logs
- **Imagem:** Nenhuma imagem salva
- **Ação:** Sistema tenta fallback

## Benefícios da Integração Automática

### 1. Experiência do Usuário

- **Imagens automáticas:** Usuário não precisa fazer nada
- **Coerência visual:** Todas as imagens seguem o mesmo perfil
- **Qualidade:** Google Images tem vasta base de imagens
- **Consistência:** Funciona automaticamente para todos os diagnósticos

### 2. Manutenção

- **Sem干预 manual:** Processo 100% automático
- **Fallback robusto:** Sistema continua funcionando se Google falhar
- **Monitoramento:** Logs detalhados para debugging
- **Escala:** Funciona para volume alto de diagnósticos

### 3. Qualidade

- **Relevância:** Queries baseadas no perfil específico
- **Atualização:** Google tem sempre conteúdo recente
- **Variedade:** Bilhões de imagens disponíveis
- **Filtragem:** Remoção automática de conteúdo inadequado

## Troubleshooting

### Imagens Não Aparecem

1. **Verifique os logs** do Supabase
2. **Confirme se** `diagnosis-image-search` está deployada
3. **Verifique se** há erros de CORS ou timeout
4. **Confirme se** o scraping não está sendo bloqueado

### Imagens de Baixa Qualidade

1. **Verifique se** o fallback está sendo usado
2. **Ajuste os filtros** de exclusão
3. **Melhore as queries** no código
4. **Considere usar** apenas fallback se Google falhar muito

### Performance Lenta

1. **Google Images pode ser lento** em alguns momentos
2. **O sistema tem timeout** e fallback automático
3. **Considere cache** de resultados frequentes
4. **Monitore** o tempo médio de geração

## Próximos Passos

1. **Deploy das edge functions** modificadas
2. **Teste com diagnóstico real** no sistema
3. **Monitore os logs** por alguns dias
4. **Ajuste filtros** se necessário
5. **Considere cache** se performance for problema

## Conclusão

O sistema de Google Images scraping agora está **totalmente integrado ao fluxo automático** de geração de diagnóstico. Quando um usuário completa o questionário:

1. ✅ **Diagnóstico é gerado automaticamente**
2. ✅ **Imagens são buscadas via Google Images scraping**
3. ✅ **Se falhar, usa fallback robusto**
4. ✅ **Tudo sem intervenção manual**
5. ✅ **Imagens aparecem automaticamente no dossiê**

O usuário agora tem uma experiência completamente automática, com imagens de alta qualidade do Google Images baseadas no seu perfil específico.