# URGENTE: Edge Function Error 500

## Problema:
A edge function `diagnosis-image-search` está retornando erro 500 para todas as seções.

## Solução Imediata:
Desabilite temporariamente o sistema de busca de imagens e reverter para o sistema antigo até que o erro seja corrigido.

## Passos:

### 1. Reverter SmartSectionImage para não chamar a edge function

No arquivo `src/components/diagnosis/result/SmartSectionImage.tsx`, comente ou remova a chamada à edge function diagnosis-image-search temporariamente.

### 2. Reverter useAutoImage para funcionar

No arquivo `src/hooks/useAutoImage.ts`, remova o `return null` e restaure a lógica original.

### 3. Deploy imediato

```bash
git add .
git commit -m "Emergency revert - disable diagnosis-image-search due to 500 error"
git push
```

## Depois:
Investigar os logs da edge function no Supabase para identificar a causa do erro 500 antes de reabilitar o sistema.
