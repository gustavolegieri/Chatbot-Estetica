# Sistema de Busca de Imagens por Diagnóstico via Google Images

## Visão Geral

O sistema de busca de imagens por diagnóstico foi implementado para fornecer imagens personalizadas baseadas no perfil de cada usuário através de **scraping direto do Google Images**. O sistema utiliza os dados específicos do diagnóstico para construir queries otimizadas e extrair imagens diretamente dos resultados de busca do Google.

## Componentes Implementados

### 1. Edge Function: `diagnosis-image-search`

**Localização:** `supabase/functions/diagnosis-image-search/index.ts`

**Funcionalidade:**
- Recebe dados do diagnóstico (questionnaire, colorAnalysis, styleAnalysis, skinTone)
- Constrói queries personalizadas baseadas no perfil do usuário
- Realiza scraping direto do Google Images para extrair imagens
- Usa múltiplas abordagens de extração (regex, JSON embutido, base64)
- Aplica filtros automáticos para evitar imagens inadequadas
- Sistema de fallback usando DuckDuckGo se o scraping direto falhar
- Retorna a melhor imagem encontrada com metadados completos

**Parâmetros de Entrada:**
```typescript
{
  diagnosisId: string;           // ID do diagnóstico
  questionnaire?: Record<string, unknown>;  // Dados do questionário
  colorAnalysis?: Record<string, unknown>;  // Análise de cores
  styleAnalysis?: Record<string, unknown>;  // Análise de estilo
  skinTone?: string;             // Tom de pele
  section?: string;              // Seção específica (estilo, cores, corpo, etc.)
  pieceName?: string;            // Nome da peça específica
  category?: string;             // Categoria da peça
  seed?: number;                 // Semente para aleatoriedade determinística
  mode?: 'product' | 'editorial'; // Modo da imagem
  excludeUrls?: string[];        // URLs para excluir
  excludeTerms?: string[];       // Termos para excluir
}
```

**Resposta:**
```typescript
{
  imageUrl: string | null;      // URL da imagem encontrada
  provider: string;             // Provedor usado (google/google-alt)
  queryUsed: string;             // Query utilizada
  colorUsed: string | null;      // Cor utilizada
  section: string;               // Seção
  pieceName: string | null;      // Nome da peça
  category: string | null;       // Categoria
  mode: string;                  // Modo
  poolSize: number;              // Tamanho do pool de candidatos
  diagnosisId: string;           // ID do diagnóstico
  message?: string;              // Mensagem de erro (se aplicável)
  triedProviders?: string[];     // Provedores tentados
}
```

### 2. Hook: `useDiagnosisImageSearch`

**Localização:** `src/hooks/useDiagnosisImageSearch.ts`

**Funcionalidade:**
- Interface React para chamar a edge function
- Gerencia estados de loading, error e resultado
- Fornece função de busca e utilitários de reset

**Uso Básico:**
```typescript
const { searchImage, loading, error, result } = useDiagnosisImageSearch();

const handleSearch = async () => {
  const result = await searchImage({
    diagnosisId: 'uuid-do-diagnostico',
    questionnaire: dadosQuestionario,
    colorAnalysis: analiseCores,
    styleAnalysis: analiseEstilo,
    skinTone: 'Médio',
    section: 'estilo',
    mode: 'editorial',
  });
  
  if (result?.imageUrl) {
    console.log('Imagem encontrada:', result.imageUrl);
  }
};
```

### 3. Componente: `DiagnosisImageSearch`

**Localização:** `src/components/DiagnosisImageSearch.tsx`

**Funcionalidade:**
- Componente React pronto para uso
- Busca automática quando params mudam
- Tratamento de erros e estados de loading
- Callbacks para quando a imagem é carregada ou falha

**Uso Básico:**
```typescript
<DiagnosisImageSearch
  params={{
    diagnosisId: 'uuid-do-diagnostico',
    section: 'estilo',
    questionnaire: dadosQuestionario,
    colorAnalysis: analiseCores,
    mode: 'editorial',
  }}
  className="w-full h-64 object-cover"
  onImageLoaded={(url) => console.log('Imagem carregada:', url)}
  onError={(error) => console.error('Erro:', error)}
  alt="Imagem de estilo"
/>
```

### 4. Componentes Especializados

#### `SectionImage`
Para imagens de seções específicas do diagnóstico:
```typescript
<SectionImage
  diagnosisId="uuid-do-diagnostico"
  section="estilo"
  questionnaire={dadosQuestionario}
  colorAnalysis={analiseCores}
  className="w-full h-64"
  onImageLoaded={(url) => console.log(url)}
/>
```

#### `PieceImage`
Para imagens de peças específicas:
```typescript
<PieceImage
  diagnosisId="uuid-do-diagnostico"
  pieceName="blazer"
  category="alfaiataria"
  questionnaire={dadosQuestionario}
  mode="product"
  className="w-full h-64"
  onImageLoaded={(url) => console.log(url)}
/>
```

### 5. Integração com `SmartSectionImage`

O componente `SmartSectionImage` foi atualizado para tentar primeiro a nova edge function `diagnosis-image-search` antes de cair no sistema existente. Isso garante:

1. **Melhoria contínua:** Novo sistema é tentado primeiro
2. **Fallback robusto:** Sistema existente como rede de segurança
3. **Transição suave:** Sem quebras na funcionalidade atual

## Lógica de Construção de Queries

A edge function constrói queries personalizadas baseadas em:

### 1. Perfil de Estilo
Mapeamento de estilos PT para fragmentos de busca:
- "Clássico e atemporal" → "classic elegant timeless"
- "Romântico e delicado" → "romantic delicate feminine"
- "Moderno e minimalista" → "modern minimalist clean"
- etc.

### 2. Paleta de Cores
Mapeamento de paletas psicométricas:
- "neutros_quentes" → "camel beige warm neutral"
- "frios_profundos" → "navy blue deep cool"
- "rosados_poeticos" → "rose pink soft blush"
- "vibrante" → "red bold vibrant jewel"

### 3. Tecidos
Mapeamento de tecidos preferidos:
- "Seda" → "silk"
- "Alfaiataria de lã" → "wool tailoring"
- "Linho" → "linen"
- etc.

### 4. Seções Específicas
Cada seção tem sua âncora de busca:
- "estilo" → "fashion style outfit look"
- "cores" → "color palette fabric swatch"
- "corpo" → "body shape silhouette fitting"
- etc.

### Query Final
A query final é construída combinando:
```
[estilo] [paleta] [cor] [tecido] women fashion [seção] [peça] [modo]
```

Exemplo:
```
modern minimalist navy blue silk women fashion style outfit look editorial photography
```

## Como Funciona o Scraping do Google Images

### Abordagem Principal: Scraping Direto

1. **Busca no Google Images:**
   - Faz uma requisição HTTP para `https://www.google.com/search` com parâmetros específicos
   - Usa User-Agent realista para evitar bloqueios
   - Inclui parâmetros para fotos (`tbm=isch`) e filtros de tipo (`tbs=itp:photo,ift:jpg`)

2. **Extração de URLs:**
   - Usa múltiplas abordagens de regex para encontrar URLs de imagens no HTML
   - Extrai URLs diretas de atributos `src`, `data-src`, `href`
   - Busca padrões JSON embutidos (`"url":`, `"ou":`)
   - Identifica imagens codificadas em base64

3. **Limpeza e Validação:**
   - Remove caracteres de escape e entidades HTML
   - Valida formato das URLs (deve terminar em .jpg, .jpeg, .png, .webp)
   - Remove duplicatas

4. **Filtragem:**
   - Aplica exclusões baseadas em termos indesejados
   - Bloqueia domínios de stock photos (shutterstock, getty, etc.)
   - Filtra URLs muito curtas ou suspeitas
   - Remove imagens do próprio Google (googleusercontent, gstatic)

### Abordagem Alternativa: DuckDuckGo Fallback

Se o scraping direto do Google falhar:
- Usa DuckDuckGo Images como alternativa
- DuckDuckGo indexa conteúdo similar ao Google
- Mesma lógica de filtragem e seleção
- Retorna como provider "google-alt"

## Vantagens do Google Images Scraping

1. **Variedade Imensa:** Acesso a bilhões de imagens indexadas pelo Google
2. **Atualização Constante:** Imagens sempre atualizadas com conteúdo recente
3. **Sem API Keys:** Não requer configuração de APIs pagas
4. **Queries Naturais:** Google entende queries em português naturalmente
5. **Flexibilidade:** Possibilidade de usar operadores avançados de busca

## Filtros Automáticos

### Exclusões Padrão
Termos automaticamente excluídos:
- Masculino: "man", "men", "male", "boy", "homem", "masculino"
- Infantil: "child", "children", "kid", "baby", "criança", "bebê"
- IA gerada: "ai generated", "stable diffusion", "midjourney"
- Stock com watermark: "watermark", "shutterstock", "getty"

### Validação de URL
No cliente, URLs são validadas contra:
- Blocklist de domínios de stock photos
- Termos off-topic no path/URL
- Dimensões mínimas (320x320)
- Aspect ratio razoável (0.5 a 2.0)

## Configuração

### Variáveis de Ambiente

O sistema de Google Images scraping **não requer variáveis de ambiente** ou API keys. Funciona imediatamente após o deploy da edge function.

### Funcionamento Sem Configuração

- **Scraping Direto:** Tenta extrair imagens diretamente do Google Images
- **Fallback Automático:** Se falhar, usa DuckDuckGo Images como alternativa
- **Sem Dependências:** Não requer configuração prévia ou chaves de API
- **Pronto para Uso:** Funciona imediatamente após o deploy

## Exemplos de Uso

### Exemplo 1: Imagem de Seção
```typescript
import { SectionImage } from '@/components/DiagnosisImageSearch';

function EstiloSection() {
  return (
    <SectionImage
      diagnosisId="123e4567-e89b-12d3-a456-426614174000"
      section="estilo"
      questionnaire={questionnaireData}
      colorAnalysis={colorAnalysisData}
      className="w-full h-96 object-cover rounded-lg"
      onImageLoaded={(url) => console.log('Imagem carregada:', url)}
    />
  );
}
```

### Exemplo 2: Imagem de Peça Específica
```typescript
import { PieceImage } from '@/components/DiagnosisImageSearch';

function PieceGallery() {
  const pieces = [
    { name: 'blazer', category: 'alfaiataria' },
    { name: 'vestido', category: 'casual' },
    { name: 'sapatos', category: 'acessorios' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {pieces.map((piece) => (
        <PieceImage
          key={piece.name}
          diagnosisId="123e4567-e89b-12d3-a456-426614174000"
          pieceName={piece.name}
          category={piece.category}
          questionnaire={questionnaireData}
          mode="product"
          className="w-full h-48 object-cover rounded"
        />
      ))}
    </div>
  );
}
```

### Exemplo 3: Uso Direto do Hook
```typescript
import { useDiagnosisImageSearch } from '@/hooks/useDiagnosisImageSearch';

function CustomImageSearch() {
  const { searchImage, loading, error, result } = useDiagnosisImageSearch();

  const handleSearch = async () => {
    const searchResult = await searchImage({
      diagnosisId: '123e4567-e89b-12d3-a456-426614174000',
      section: 'estilo',
      questionnaire: questionnaireData,
      colorAnalysis: colorAnalysisData,
      seed: 42,
      mode: 'editorial',
    });

    if (searchResult?.imageUrl) {
      // Usar a imagem
      setImageUrl(searchResult.imageUrl);
    }
  };

  return (
    <div>
      <button onClick={handleSearch} disabled={loading}>
        {loading ? 'Buscando...' : 'Buscar Imagem'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
      {result?.imageUrl && (
        <img src={result.imageUrl} alt="Imagem encontrada" />
      )}
    </div>
  );
}
```

## Troubleshooting

### Imagens não são encontradas
1. **Scraping bloqueado:** Google pode estar bloqueando requisições automáticas
   - Verifique logs para mensagens de erro HTTP
   - O sistema tentará automaticamente o fallback para DuckDuckGo
2. **Query muito específica:** Tente simplificar a query
3. **Filtros muito restritivos:** Reduza a lista de `excludeTerms`
4. **Verifique logs:** Os logs mostram detalhes do processo de scraping

### Imagens inadequadas aparecem
1. **Ajuste filtros de exclusão:** Adicione termos específicos a `excludeTerms`
2. **Revise validação de URL:** No cliente, verifique a blocklist de domínios
3. **Use modo "product":** Para imagens mais controladas de produtos
4. **Verifique query:** A query pode estar muito genérica

### Performance lenta
1. **Scraping é processo pesado:** Extração de HTML é mais lento que APIs
2. **Google pode responder lentamente:** Dependendo da hora e tráfego
3. **Considere cache:** Implemente cache de resultados no banco de dados
4. **Use seeds determinísticas:** Evita buscas duplicadas da mesma query

### Bloqueios do Google
1. **User-Agent rotation:** O sistema usa um User-Agent fixo, mas pode precisar de rotação
2. **Rate limiting:** Google pode limitar requisições frequentes
3. **CAPTCHA:** Em casos extremos, Google pode exigir CAPTCHA
4. **Solução:** O sistema cai automaticamente no fallback DuckDuckGo

## Melhorias Futuras

Possíveis melhorias para o sistema:

1. **Cache Inteligente:** Cache de resultados por assinatura de diagnóstico
2. **User-Agent Rotation:** Sistema de rotação de User-Agents para evitar bloqueios
3. **Proxy Rotation:** Usar proxies diferentes para distribuir requisições
4. **CAPTCHA Handling:** Integração com serviços de solução de CAPTCHA
5. **Google Custom Search API:** Integração com API oficial do Google para maior confiabilidade
6. **Ranking de Qualidade:** Sistema de pontuação para escolher a melhor imagem
7. **Feedback do Usuário:** Permitir que usuários avaliem as imagens
8. **Analytics:** Rastrear quais queries funcionam melhor no Google Images

## Conclusão

O sistema de busca de imagens por diagnóstico via Google Images scraping fornece uma solução poderosa e personalizada para gerar imagens relevantes baseadas no perfil de cada usuário. Com acesso à vastíssima base de imagens do Google, o sistema mantém a qualidade e a coerência visual em todo o dossiê de diagnóstico, sem depender de APIs pagas ou configurações complexas.

O sistema de fallback automático garante robustez mesmo quando o scraping direto enfrenta bloqueios, proporcionando uma experiência confiável e consistente para os usuários finais.