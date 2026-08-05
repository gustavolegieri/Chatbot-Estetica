# Fix: Tops e Blusas sem Imagem

## Problema:
A categoria "tops" (blusas) não estava renderizando imagem porque não tinha um nome específico de peça (pieceName).

## Solução:

### 1. SmartSectionImage.tsx
- Se não tiver `pieceName`, usa `category` como fallback
- Exemplo: se category="top", pieceName vira "top fashion"
- Isso garante que sempre tenha algum termo para a busca

### 2. diagnosis-image-search (Edge Function)
- Adicionado mapeamento de categorias para termos de busca
- Se não tiver pieceName, usa termos específicos da categoria:
  - tops → "top blouse shirt"
  - bottoms → "pants trousers skirt"
  - vestidos → "dress"
  - tercas_pecas → "jacket blazer coat"
  - calcados → "shoes heels boots"
  - bolsas → "handbag purse"

## Deploy:

### Edge Function:
1. Supabase Dashboard → Edge Functions → diagnosis-image-search
2. Edit → Copie `supabase/functions/diagnosis-image-search/index.ts`
3. Cole → Deploy

### Frontend:
```bash
git add .
git commit -m "Fix tops and blusas no image - add category fallback"
git push
```

## Resultado:

Agora mesmo que não tenha um nome específico da peça, a query será:
- "top blouse shirt moderno e minimalista azul marinho verde seda algodão woman capsule wardrobe collection fashion product photography white background"

Isso garante que tops/blusas tenham imagens específicas da categoria, com o estilo e cores do usuário.

## Debug Logs:

Os logs adicionados ainda estão ativos para verificar se as queries estão sendo geradas corretamente. Se ainda houver problemas, verifique:
- Console do navegador: `[SmartSectionImage] Calling diagnosis-image-search with:`
- Supabase Edge Function logs: `[buildQuery] Final query:`
