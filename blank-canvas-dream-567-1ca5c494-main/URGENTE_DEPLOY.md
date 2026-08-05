# ⚠️ URGENTE: Deploy Manual das Edge Functions Necessário

## Problema Identificado

Você ainda está vendo:
```
[image-search:fallback] pexels-search-image ok
```

**Isso indica que as edge functions do Supabase NÃO foram atualizadas!**

## Por que isso acontece?

O código local (frontend) está atualizado, mas as **edge functions rodam no Supabase** e precisam ser deployadas manualmente. As mudanças no código local não afetam as edge functions automaticamente.

## Solução: Deploy Manual Obrigatório

### Passo 1: Atualizar `diagnosis-image-search`

1. Acesse: https://supabase.com/dashboard
2. Projeto: `vuptrdbizivuqwyrcebu`
3. Navegue para: **Edge Functions** → **diagnosis-image-search**
4. Clique em **Edit**
5. **COPIE o código atualizado** do arquivo local:
   ```
   supabase/functions/diagnosis-image-search/index.ts
   ```
6. **COLE no editor do Supabase**
7. Clique em **Save/Deploy**

### Passo 2: Atualizar `generate-section-images`

1. Navegue para: **Edge Functions** → **generate-section-images**
2. Clique em **Edit**
3. **COPIE o código atualizado** do arquivo local:
   ```
   supabase/functions/generate-section-images/index.ts
   ```
4. **COLE no editor do Supabase**
5. Clique em **Save/Deploy**

### Passo 3: Atualizar `search-clothing-image` (se existir)

1. Navegue para: **Edge Functions** → **search-clothing-image**
2. Clique em **Edit**
3. **COPIE o código atualizado** do arquivo local:
   ```
   supabase/functions/search-clothing-image/index.ts
   ```
4. **COLE no editor do Supabase**
5. Clique em **Save/Deploy**

## O que foi alterado nas edge functions:

### diagnosis-image-search
- ✅ Query agora usa dados do questionário (estiloPersonalidade, coresQueTeFazemBrilhar, tecidosPreferidos)
- ✅ Mapeamento de cores PT→EN
- ✅ Mapeamento de tecidos PT→EN
- ✅ Contexto específico por seção (movimento, inspiracoes, etc.)
- ✅ Fallback interno para DuckDuckGo (não usa Pexels)

### generate-section-images
- ✅ Removido fallback para Pexels, Unsplash, Pixabay
- ✅ Usa apenas Google Images + DuckDuckGo
- ✅ Prioriza Google Images scraping

## Como verificar se funcionou:

### No console do navegador (depois do deploy):

**ANTES (ainda vendo Pexels):**
```
[image-search:fallback] pexels-search-image ok
```

**DEPOIS (deploy correto):**
```
[SmartSectionImage] ✓ Image found via diagnosis-image-search: estilo provider: google
[SmartSectionImage] ✓ Image found via diagnosis-image-search: cores provider: google-alt
```

**NÃO deve aparecer mais:**
```
pexels-search-image
```

### No dashboard do Supabase:

1. Vá para: **Edge Functions** → **diagnosis-image-search** → **Logs**
2. Deve ver logs como:
   ```
   [diagnosis-search] Built query: "moderno e minimalista azul marinho seda woman style outfit editorial photography"
   [diagnosis-search] Provider: google
   ```

## Problema 403 (Permissões do Banco)

Você também precisa corrigir as permissões RLS:

1. Dashboard → **Database** → **Tables** → **diagnosis_section_images**
2. Clique em **Policies**
3. Adicione política:
   ```sql
   CREATE POLICY "Users can insert diagnosis_section_images"
   ON diagnosis_section_images
   FOR INSERT
   TO authenticated
   WITH CHECK (true);
   ```

## Resumo

**O sistema local está rodando, mas as edge functions no Supabase estão desatualizadas. Você PRECISA fazer o deploy manual das edge functions para que as melhorias entrem em vigor.**

Depois do deploy:
- ✅ Queries específicas ao questionário
- ✅ Sem Pexels
- ✅ Imagens relevantes ao perfil
- ✅ Sem erro 403 (após configurar RLS)
