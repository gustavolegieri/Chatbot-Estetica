# Instruções para Testar o Sistema Localmente

## Servidor está Rodando

O servidor de desenvolvimento está rodando em:
- **Local:** http://localhost:8081
- **Network:** http://192.168.0.245:8081

## Como Acessar a Página de Teste

1. **Abra seu navegador** e acesse:
   ```
   http://localhost:8081/test-google-images
   ```

2. **Ou acesse via rede:**
   ```
   http://192.168.0.245:8081/test-google-images
   ```

## O que Você Verá na Página de Teste

A página de teste inclui:

### 1. Configuração do Teste
- **Diagnosis ID:** Campo para inserir o ID do diagnóstico
- **Seção:** Dropdown para escolher a seção (estilo, cores, corpo, etc.)
- **Botão "Testar Busca":** Executa a busca de imagem

### 2. Área de Resultados
- Mostra o timestamp do teste
- Provider usado (google/google-alt)
- Tamanho do pool de imagens
- Query utilizada
- Imagem encontrada (se houver)
- URL completa da imagem

### 3. Informações do Sistema
- Explica como o scraping funciona
- Detalhes sobre o fallback
- Informações sobre filtros automáticos

## Como Testar

### Passo 1: Acesse a Página
```
http://localhost:8081/test-google-images
```

### Passo 2: Configure os Parâmetros
- **Diagnosis ID:** Use "test-diagnosis-id" para teste inicial
- **Seção:** Escolha "estilo" para começar

### Passo 3: Execute o Teste
- Clique em "Testar Busca"
- Aguarde o resultado (pode levar alguns segundos)

### Passo 4: Analise o Resultado
- Verifique se uma imagem foi encontrada
- Observe o provider usado
- Analise a query utilizada
- Verifique se a imagem é relevante

### Passo 5: Teste Outras Seções
- Mude a seção para "cores", "corpo", "modelagens", etc.
- Execute novamente o teste
- Compare os resultados

## O que Esperar

### Caso de Sucesso
- Provider: "google" ou "google-alt"
- Pool Size: Número > 0
- Imagem: URL válida de imagem
- Query: Texto descritivo em português/inglês

### Caso de Falha
- Provider: "none" ou "error"
- Pool Size: 0
- Mensagem de erro explicativa
- Nenhuma imagem exibida

## Troubleshooting

### Página Não Carrega
1. Verifique se o servidor está rodando
2. Tente acessar http://localhost:8081
3. Verifique o console do navegador para erros

### Botão Não Funciona
1. Abra o console do navegador (F12)
2. Procure por erros de JavaScript
3. Verifique se há erros de rede

### Nenhuma Imagem Encontrada
1. Verifique o console para logs detalhados
2. Pode ser que o scraping do Google foi bloqueado
3. O sistema deve tentar o fallback automaticamente

### Erros de CORS
1. Verifique se a edge function está deployada
2. Verifique as configurações do Supabase
3. Confirme que os headers CORS estão corretos

## Logs Importantes

No console do navegador, procure por:
- `[useDiagnosisImageSearch]` - Logs do hook React
- `[diagnosis-search]` - Logs da edge function
- `[google-images]` - Logs do scraping do Google
- `[google-images-alt]` - Logs do fallback

## Próximos Passos Após Teste

1. **Validar qualidade das imagens** - Verifique se são relevantes
2. **Testar diferentes seções** - Confira se cada seção retorna imagens apropriadas
3. **Testar com diagnosis ID real** - Use um ID real do sistema
4. **Verificar performance** - Note o tempo de resposta
5. **Testar o fallback** - Force uma falha para testar o DuckDuckGo

## Contato

Se encontrar problemas:
1. Verifique os logs do navegador
2. Verifique os logs do servidor
3. Consulte a documentação em docs/DIAGNOSIS_IMAGE_SEARCH.md
4. Consulte a documentação técnica em docs/GOOGLE_IMAGES_SCRAPING.md