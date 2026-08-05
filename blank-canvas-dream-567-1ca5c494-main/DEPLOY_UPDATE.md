# Deploy das Edge Functions Atualizadas

## O que foi melhorado:

### 1. Queries Mais Específicas ao Questionário
Agora a query usa dados diretos do questionário:
- **estiloPersonalidade** - Estilo pessoal do usuário
- **coresQueTeFazemBrilhar** - Cores específicas que o usuário ama
- **tecidosPreferidos** - Tecidos específicos que o usuário prefere
- **tomDePele** - Tom de pele específico
- **Contexto por seção** - Adiciona contexto específico (movimento, inspirações, etc.)

### 2. Removido Fallback para Pexels
- `generate-section-images` não usa mais Pexels
- Usa apenas Google Images + DuckDuckGo fallback
- Garante consistência nas imagens

### 3. Removido Fallback para Sistema Antigo
- `SmartSectionImage` não cai mais para sistema existente
- Usa apenas Google Images scraping
- Se falhar, mostra estado de falha em vez de usar Pexels

## Como Fazer o Deploy:

### Passo 1: Atualizar diagnosis-image-search

1. Acesse https://supabase.com/dashboard
2. Projeto: vuptrdbizivuqwyrcebu
3. **Edge Functions** → **diagnosis-image-search**
4. Clique em **Edit**
5. Copie o código atualizado de `supabase/functions/diagnosis-image-search/index.ts`
6. Cole no editor
7. Clique em **Save/Deploy**

### Passo 2: Atualizar generate-section-images

1. **Edge Functions** → **generate-section-images**
2. Clique em **Edit**
3. Copie o código atualizado de `supabase/functions/generate-section-images/index.ts`
4. Cole no editor
5. Clique em **Save/Deploy**

### Passo 3: Atualizar SmartSectionImage (Frontend)

O arquivo `src/components/diagnosis/result/SmartSectionImage.tsx` já foi atualizado.
Como o servidor está rodando, as mudanças já estarão ativas com hot reload.

## Como Verificar Melhorias:

### 1. Verifique os Logs
No console do navegador, agora você verá:
```
[SmartSectionImage] ✓ Image found via diagnosis-image-search: estilo provider: google
[SmartSectionImage] ✓ Image found via diagnosis-image-search: cores provider: google-alt
```

**NÃO deve aparecer mais:**
```
[image-search:fallback] pexels-search-image ok
```

### 2. Verifique as Queries
No console do Supabase (Edge Functions → diagnosis-image-search → Logs), você verá queries como:
```
[diagnosis-search] Built query: "moderno e minimalista azul marinho seda woman style outfit editorial photography"
[diagnosis-search] Built query: "clássico rosa veludo woman movement flow editorial photography"
```

Antes eram genéricas como:
```
modern style fashion women editorial photography
```

### 3. Verifique as Imagens
As imagens agora devem ser:
- Mais relevantes ao perfil específico
- Baseadas nas cores e tecidos que o usuário escolheu
- Contextualizadas pela seção específica

## Resumo das Mudanças:

### Antes:
- Query genérica: "modern style fashion women"
- Fallback para Pexels (indesejado)
- Fallback para sistema antigo (indesejado)
- Imagens pouco específicas

### Depois:
- Query específica: "moderno e minimalista azul marinho seda woman style outfit"
- Sem fallback para Pexels
- Sem fallback para sistema antigo
- Imagens baseadas no questionário específico

## Problema 403:

O erro 403 ao salvar no banco é um problema de permissões RLS. Você precisa configurar as políticas da tabela `diagnosis_section_images` no Supabase Dashboard:

1. **Database** → **Tables** → **diagnosis_section_images**
2. Clique em **Policies**
3. Adicione ou atualize a política para permitir INSERT:
```sql
CREATE POLICY "Users can insert diagnosis_section_images"
ON diagnosis_section_images
FOR INSERT
TO authenticated
WITH CHECK (true);
```

Após essas correções, o sistema usará apenas Google Images scraping com queries específicas ao questionário do usuário.
