
## Diagnóstico atual (o que já existe e o que falha)

O sistema já tem uma boa base em `src/lib/queryFragments.ts` (dicionário curto EN + cor nativa por coloração) e `SmartSectionImage.tsx` (usa esse dicionário nas seções do dossiê). O problema é que essa disciplina **não está aplicada de ponta a ponta**. Pontos frágeis mapeados:

1. **Peças de guarda-roupa (`useLookImages` / `useAutoImage` / `search-clothing-image`)** ainda enviam a descrição bruta da peça ("boots combat low-rise camurca lavada azul-anil"), misturando PT+EN. Nunca foi migrado para `queryFragments`.
2. **Unsplash e Pixabay retornam 404** em produção (comprovado por `curl`) — ou não foram deployadas, ou têm nome/slug diferente no projeto remoto. Sem elas a rotação de provedor não existe e o Pexels vira ponto único de falha.
3. **Mapa `SECTION_QUERY_MAP` é incompleto**: `tecidos_materiais`, `coloracao_avancada`, `moodboard`, `inspiracoes` caem em `estilo`/`cores`, então não usam fragmentos próprios (tecido/estampa/rotina/ocasião ficam mudos nessas abas).
4. **Cor nativa vem só da coloração pessoal** — a paleta escolhida no Bloco 4 (rosados_poeticos, vibrante, etc.) não influencia o parâmetro `color=`. Resultado: paleta rosados_poéticos + subtom quente → API recebe `color=orange`, imagem fica dissonante.
5. **Alfaiataria vs. Cores/Paleta** ainda podem se sobrepor se `estilo === alfaiataria` e o dicionário retornar imagem parecida.
6. **Auditoria IA** (`admin-analyze-diagnosis`) valida coerência mas não força regeneração automática das peças/seções reprovadas.

## Plano de correção — divisível em 6 tarefas independentes

### Tarefa 1 — Consertar Unsplash/Pixabay em produção (pré-requisito)
- Confirmar via CLI (`supabase functions list`) se `unsplash-search-image` e `pixabay-search-image` existem no projeto remoto. Se não existem, fazer deploy pela CLI/dashboard.
- Se existem com outro slug, alinhar o nome no cliente (`invokeQueue`) ou renomear no server.
- Adicionar secrets `UNSPLASH_ACCESS_KEY` e `PIXABAY_API_KEY` no dashboard (se faltarem).
- Validação: `curl` retornando 200 nas 3 funções.

### Tarefa 2 — Migrar peças de guarda-roupa para o mesmo dicionário curto
Criar `src/lib/pieceFragments.ts` com 3 sub-dicionários fixos PT→EN:
- **Tipo**: calça→pants, blusa→blouse, bermuda→shorts, bota→boots, mocassim→loafer, cropped→crop top, etc. (~40 entradas cobrem todas as peças hoje geradas).
- **Corte/modelagem**: cintura alta→high waist, oversized→oversized, reto→straight, evasê→a-line, alfaiataria→tailored…
- **Cor-âncora**: mapa que colapsa variações estéticas ("azul-anil", "azul-petróleo claro", "azul-marinho") em nomes EN simples (navy, blue, sky blue). Nunca envia a variação PT.

Query final da peça = `${tipo} ${corte} ${cor} women fashion` (máx. 6 palavras). Aplicar em `useAutoImage.ts` (função que monta query da peça) e passar cor-âncora como parâmetro `color=` nativo. Remover a descrição bruta atual.

### Tarefa 3 — Completar o `SECTION_QUERY_MAP` em `SmartSectionImage.tsx`
Adicionar entradas dedicadas em `buildSectionQuery`:
- `tecidos_materiais` → tecido + ocasião (hoje cai em essenciais, mas o mapa aponta pra `estilo`)
- `coloracao_avancada` → paleta + estampa (hoje aponta pra `cores`)
- `moodboard` → estilo + paleta (correto, mas com seed **por bloco de moodboard**, não uma seed única — evita 4 imagens iguais)
- `inspiracoes` → estilo + rotina (movimento diferente de estilo)

### Tarefa 4 — Cor nativa também respeitar a paleta escolhida (Bloco 4)
Estender `resolveNativeColor` para receber a paleta preferida como override editorial em seções `paleta`, `cores`, `moodboard`:
- rosados_poeticos → `pink`
- vibrante → `red` (ou `violet` conforme subtipo)
- frios_profundos → `blue`
- neutros_quentes → cor da coloração pessoal (mantém regra atual)

Coloração pessoal continua mandando nas outras seções (estilo, movimento, essenciais, capsula, alfaiataria) — ninguém quer alfaiataria rosa se a pessoa é Inverno Frio.

### Tarefa 5 — Dedup determinístico por seção (moodboard sem repetição)
`usedImageUrls` hoje é um Set global. Para o moodboard (4-6 tiles) somar:
- seed derivada de `(diagnosisId, sectionKey, tileIndex)` — não só `(diagnosisId, sectionKey)`
- exigir que cada tile do moodboard pegue `page` diferente na API (co-primo simples: `tileIndex * 7 + 1`)
- se o provedor devolver URL já reservada, tentar próximo item da resposta antes de trocar de provedor

### Tarefa 6 — Auto-regen a partir da auditoria
No `admin-analyze-diagnosis`, quando o audit visual reprovar uma seção/peça (`match_score < X`), gravar `needs_regen: true` na linha correspondente (`diagnosis_section_images` / `look_images`). Um botão no admin "Regenerar reprovadas" chama `generate-section-images` só para as flagadas — sem refazer o dossiê inteiro.

## Ordem sugerida
1 → 2 → 3 → 4 → 5 → 6. As 3 primeiras resolvem ~80% dos casos visíveis hoje. As duas últimas são polimento.

## Detalhes técnicos (para referência)

Arquivos afetados por tarefa:

```text
T1: supabase/functions/{unsplash,pixabay}-search-image/index.ts  (+ deploy)
T2: src/lib/pieceFragments.ts (novo)
    src/hooks/useAutoImage.ts        (buildPieceQuery)
    src/hooks/useLookImages.ts       (consumo)
    supabase/functions/search-clothing-image/index.ts  (aceitar color=)
T3: src/components/diagnosis/result/SmartSectionImage.tsx
    src/lib/queryFragments.ts        (novo SectionQueryId cases)
T4: src/lib/queryFragments.ts        (resolveNativeColor recebe paletaOverride)
    src/components/diagnosis/result/SmartSectionImage.tsx
T5: src/components/diagnosis/result/StructuredMoodboards.tsx
    src/components/diagnosis/result/SmartSectionImage.tsx (seed por tile)
T6: supabase/functions/admin-analyze-diagnosis/index.ts
    src/pages/admin/AdminDiagnoses.tsx
```

Quer que eu execute na ordem 1→6, ou prefere priorizar alguma tarefa (ex.: só peças de guarda-roupa, T2)?
