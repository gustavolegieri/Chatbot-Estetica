# Instruções de Deploy da Edge Function diagnosis-image-search

## Problema Atual

A edge function `diagnosis-image-search` não está deployada no Supabase, por isso está ocorrendo erro de conexão e o sistema está usando o fallback (Pexels) em vez do Google Images scraping.

## Solução: Deploy Manual via Dashboard do Supabase

### Passo 1: Acessar o Dashboard do Supabase

1. Acesse https://supabase.com/dashboard
2. Faça login na sua conta
3. Selecione o projeto: `vuptrdbizivuqwyrcebu`

### Passo 2: Ir para Edge Functions

1. No menu lateral, clique em **Edge Functions**
2. Você verá a lista de edge functions existentes

### Passo 3: Criar Nova Edge Function

1. Clique no botão **"New Edge Function"**
2. Nome: `diagnosis-image-search`
3. Clique em **"Create"**

### Passo 4: Colar o Código

1. Copie todo o conteúdo do arquivo:
   ```
   supabase/functions/diagnosis-image-search/index.ts
   ```

2. Cole no editor de código do dashboard
3. Clique em **"Save"** ou **"Deploy"**

### Passo 5: Verificar o Deploy

1. Após o deploy, você verá a função na lista
2. Teste a função clicando em **"Invoke"**
3. Use o seguinte JSON de teste:

```json
{
  "diagnosisId": "test-diagnosis-id",
  "questionnaire": {
    "estiloPersonalidade": "Moderno e minimalista",
    "psicometrico": { "paleta": "paleta_neutra" },
    "tecidosPreferidos": ["Seda"],
    "coresQueTeFazemBrilhar": ["Azul marinho"]
  },
  "colorAnalysis": {
    "cores": ["azul marinho", "cinza", "branco"],
    "tomDePele": "Médio"
  },
  "styleAnalysis": {
    "estilo": "moderno minimalista"
  },
  "section": "estilo",
  "seed": 12345,
  "mode": "editorial"
}
```

### Passo 6: Deploy das Outras Edge Functions Modificadas

Você também precisa atualizar as edge functions modificadas:

#### generate-section-images

1. Encontre a função `generate-section-images` na lista
2. Clique em **"Edit"**
3. Copie o conteúdo de `supabase/functions/generate-section-images/index.ts`
4. Cole no editor
5. Clique em **"Save"** ou **"Deploy"**

#### search-clothing-image

1. Encontre a função `search-clothing-image` na lista
2. Clique em **"Edit"**
3. Copie o conteúdo de `supabase/functions/search-clothing-image/index.ts`
4. Cole no editor
5. Clique em **"Save"** ou **"Deploy"**

## Solução Alternativa: Usar Supabase CLI

Se preferir usar a CLI, você precisa configurar o projeto:

### Passo 1: Instalar Supabase CLI

```bash
npm install -g supabase
```

### Passo 2: Linkar o Projeto

```bash
supabase link --project-ref vuptrdbizivuqwyrcebu
```

### Passo 3: Fazer Login

```bash
supabase login
```

### Passo 4: Deploy da Edge Function

```bash
supabase functions deploy diagnosis-image-search
```

### Passo 5: Deploy das Outras Funções

```bash
supabase functions deploy generate-section-images
supabase functions deploy search-clothing-image
```

## Verificar Permissões do Banco de Dados

O erro 403 indica problema de permissões. Verifique:

### 1. Row Level Security (RLS)

1. No dashboard, vá em **Database** → **Tables**
2. Encontre a tabela `diagnosis_section_images`
3. Clique em **"Policies"**
4. Verifique se há uma política que permite inserção

### 2. Criar Política se Necessário

Se não houver política ou ela estiver restrita, crie uma nova:

```sql
-- Allow authenticated users to insert diagnosis_section_images
CREATE POLICY "Users can insert diagnosis_section_images"
ON diagnosis_section_images
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update diagnosis_section_images
CREATE POLICY "Users can update diagnosis_section_images"
ON diagnosis_section_images
FOR UPDATE
TO authenticated
USING (true);
```

## Testar Após Deploy

### 1. Teste Manual da Edge Function

No dashboard do Supabase:
1. Vá em **Edge Functions** → **diagnosis-image-search**
2. Clique em **"Invoke"**
3. Use o JSON de teste acima
4. Verifique se retorna uma URL de imagem

### 2. Teste no Frontend

1. Acesse http://localhost:8083/test-google-images
2. Execute um teste
3. Verifique os logs do console
4. Deve mostrar: `[useDiagnosisImageSearch]` sem erros

### 3. Teste com Diagnóstico Real

1. Crie um novo diagnóstico no sistema
2. Aguarde a geração
3. Verifique se as imagens aparecem
4. Confira os logs do Supabase

## Logs Importantes

Após o deploy, monitore os logs:

### No Console do Navegador

- `[useDiagnosisImageSearch]` - Hook React
- `[SmartSectionImage]` - Componente de imagem
- `[diagnosis-search]` - Edge function

### No Dashboard do Supabase

- **Edge Functions** → **diagnosis-image-search** → **Logs**
- Procure por: `[google-images]`, `[diagnosis-search]`

## Troubleshooting

### Edge Function Não Aparece

1. Verifique se o nome está correto: `diagnosis-image-search`
2. Tente criar novamente com o mesmo nome
3. Verifique se há erros de sintaxe no código

### Erro ao Invocar

1. Verifique se o código foi salvo corretamente
2. Confirme se não há erros de sintaxe TypeScript
3. Tente usar o JSON de teste simples

### Erro 403 Persiste

1. Verifique as políticas RLS da tabela
2. Confirme se o usuário está autenticado
3. Tente criar as políticas sugeridas acima

### Imagens Ainda Vêm do Pexels

1. Verifique os logs para confirmar se `diagnosis-image-search` foi chamada
2. Confirme se a edge function está funcionando
3. Verifique se o Google Images scraping está retornando imagens

## Resumo

Para resolver o problema atual:

1. ✅ **Deploy manual** da edge function `diagnosis-image-search` via dashboard
2. ✅ **Update** das edge functions `generate-section-images` e `search-clothing-image`
3. ✅ **Verificar políticas RLS** da tabela `diagnosis_section_images`
4. ✅ **Testar** com diagnóstico real

Após essas correções, o Google Images scraping funcionará automaticamente.
