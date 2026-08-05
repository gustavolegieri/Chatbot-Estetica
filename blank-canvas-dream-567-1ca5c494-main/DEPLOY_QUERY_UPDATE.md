# Deploy da Edge Function diagnosis-image-search

As queries foram refinadas para criar um **look coerente e consistente** em todo o diagnóstico:

## Melhorias:

1. **Cores consistentes**: Usa sempre as primeiras 2 cores da paleta do usuário
2. **Tecidos consistentes**: Usa sempre os primeiros 2 tecidos da lista do usuário
3. **Novos campos**: Adicionado `vibes` e `ocasiao` do questionário
4. **Mapeamento expandido**: Mais cores e tecidos traduzidos PT→EN
5. **Contexto rico**: Queries mais específicas por seção

## Estratégia de Consistência:

- **Todas as seções usam a MESMA paleta de cores**
- **Todas as seções usam os MESMOS tecidos**
- **Todas as seções usam o MESMO estilo**
- Isso cria um look coerente e profissional
- O seed apenas varia a imagem específica (não a paleta)

## Exemplo de Consistência:

Para um usuário com paleta [azul marinho, verde oliva, coral] e tecidos [seda, algodão, linho]:

- Seção "estilo": "moderno e minimalista azul marinho verde seda algodão woman personal style outfit"
- Seção "cores": "moderno e minimalista azul marinho verde seda algodão woman color palette outfit"
- Seção "corpo": "moderno e minimalista azul marinho verde seda algodão woman body type outfit"
- **TODAS com as mesmas cores e tecidos!**

## Deploy Manual Necessário:

1. Vá no Supabase Dashboard → Edge Functions → diagnosis-image-search
2. Clique em Edit
3. Copie todo o conteúdo de `supabase/functions/diagnosis-image-search/index.ts`
4. Cole no editor do Supabase
5. Clique em Deploy

## Deploy Frontend (Vercel):

1. Commit e push as mudanças do useAutoImage.ts
2. O Vercel vai fazer o deploy automaticamente

## Após Deploy:

Teste novamente no app. As queries agora serão:
- Exemplo: "moderno e minimalista azul marinho verde seda algodão woman color palette outfit fashion editorial photography lifestyle"
- **Todas as seções terão as mesmas cores e tecidos (look coerente)**
