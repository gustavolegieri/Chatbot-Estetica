# Configurações Importantes para Desenvolvimento

## Problemas de Conexão do Prisma

### Problema Original
O pool de conexões do Prisma estava configurado com `connection_limit=1`, causando timeouts quando múltiplas requisições webhook chegavam simultaneamente, resultando em crashes da aplicação:

```
Error [PrismaClientKnownRequestError]: 
Timed out fetching a new connection from the connection pool. 
(Current connection pool timeout: 10, connection limit: 10)
```

### Solução Aplicada
1. **Aumentado pool de conexões em `src/lib/database-url.ts`:**
   - Mudado de `connection_limit=10` para `connection_limit=50` (para alto volume)
   - A função `repairDatabaseUrl` automaticamente ajusta o connection_limit
   - Isso permite lidar com 200+ mensagens diárias em ambiente serverless (Vercel)

2. **Atualizado `.env.example`:**
   - Mudado de `connection_limit=10` para `connection_limit=50` na DATABASE_URL

### Configuração Recomendada
Para produção em Vercel/Supabase com alto volume:
```
DATABASE_URL=postgresql://postgres.SEU_REF:SENHA@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=50&sslmode=require
```

## Otimizações para Alto Volume (200+ mensagens diárias)

### Pool de Conexões
- **Connection_limit:** Aumentado para 50 para suportar alta concorrência
- **Debounce:** Reduzido de 2800ms para 500ms para plano gratuito WASender API (1 msg/min)
- **Timeout de processamento:** Reduzido de 30s para 15s para evitar travamentos
- **Processamento síncrono:** Webhook processa mensagem antes de responder (evita problemas com WASender API)
- **Logs reduzidos:** Removidos logs excessivos para reduzir overhead no Vercel

### Limitações da WASender API Gratuita
- **Imagens em Data URL:** A API gratuita não suporta envio de imagens como data URLs (base64)
- **Fallback de calendário:** Calendário é enviado como texto quando a imagem falha
- **Rate limit:** 1 mensagem por minuto no plano gratuito

### Cache de Deduplicação
- **TTL:** Reduzido de 24h para 6h para menor uso de memória
- **Limite de limpeza:** Aumentado de 10000 para 5000 entradas

### Otimizações de Banco de Dados
- **Upsert em vez de find + create:** Reduz queries no banco
- **Reutilização de sessão:** Evita queries desnecessárias ao recarregar estado

## Processamento Duplicado de Webhook

### Problema Original
Mensagens do webhook estavam sendo processadas múltiplas vezes, causando respostas duplicadas.

### Solução Aplicada
1. **Corrigida ordem de marcação de deduplicação em `src/app/api/whatsapp/webhook/route.ts`:**
   - Mensagem agora é marcada como processada ANTES do processamento
   - Em caso de erro, a marcação é removida para permitir retry
   - Isso evita que requisições simultâneas processem a mesma mensagem

2. **Sistema de debouncing já existente em `src/lib/whatsapp-debounce.ts`:**
   - Agrupa mensagens rápidas em uma só (anti-flood)
   - Usa filas por telefone para processamento serial
   - Timeout de segurança de 30s para evitar travamentos

## Modo de Teste

### Implementação Atual
O modo de teste filtra mensagens baseado no número de telefone configurado:
- Verifica `settings.testModeEnabled` e `settings.testModePhone`
- Remove não-dígitos de ambos os números para comparação
- Apenas o telefone configurado é autorizado quando o modo está ativo

### Melhorias Aplicadas
1. **Validação adicional em `src/app/api/whatsapp/webhook/route.ts`:**
   - Se modo de teste está ativo mas nenhum telefone configurado, ignora todas as mensagens
   - Logs mais detalhados mostrando comprimento dos números para debug
   - Evita comportamento indefinido quando falta configuração

### Configuração
Configure o modo de teste através do painel admin:
- Ativar/desativar modo de teste
- Definir número de telefone autorizado (formato: 5511972851072)

## Comandos Úteis

### Desenvolvimento
```bash
npm run dev              # Servidor de desenvolvimento
npm run build            # Build de produção
npm run db:push          # Sincroniza schema com o banco
npm run db:seed          # Popula dados iniciais
npm run db:studio        # Interface visual do Prisma
```

### Testes
Antes de fazer deploy em produção:
1. Teste webhook com modo de teste ativado
2. Verifique logs para ver se não há mensagens duplicadas
3. Teste carga com múltiplas requisições simultâneas
4. Verifique se não há erros de pool de conexões

### Monitoramento
- Logs do webhook mostram processo de deduplicação
- Logs do modo de teste mostram comparação de números
- Logs do Prisma mostram erros de conexão se houver

## Testando o Bot com Seu Próprio Número

### Interface de Teste Web
Acesse: `http://localhost:3000/admin/test-webhook`

Esta interface permite simular mensagens recebidas do WhatsApp:
- Configure o número de telefone (seu próprio número)
- Digite a mensagem desejada
- Opcionalmente, adicione buttonId, listId ou pushName
- Clique em "Enviar Mensagem de Teste"

### API Direta
Você também pode usar a API diretamente:

```bash
curl -X POST http://localhost:3000/api/admin/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511972851072",
    "text": "Oi",
    "pushName": "Teste"
  }'
```

### Testar Envio Direto (WasenderAPI)
Acesse: `http://localhost:3000/admin/testar-envio`

Esta interface permite testar o envio direto de mensagens via WasenderAPI:
- Configure o número de telefone
- Digite a mensagem desejada
- Clique em "Enviar Mensagem de Teste"
- Veja o resultado detalhado do envio

### Diagnóstico WhatsApp
Acesse: `http://localhost:3000/admin/diagnostico-whatsapp`

Esta interface verifica a configuração do sistema WhatsApp:
- Verifica se WASENDER_API_KEY está configurada
- Testa conexão com a WasenderAPI
- Verifica configurações do WhatsApp (habilitado/desabilitado)
- Mostra instruções para configurar WasenderAPI

### Mensagens de Teste Comuns
- &quot;Oi&quot; ou &quot;Olá&quot; - Inicia o fluxo de boas-vindas
- &quot;menu&quot; - Volta ao menu principal
- &quot;1&quot;, &quot;2&quot;, etc. - Seleciona opções numeradas
- &quot;agendar&quot; - Inicia fluxo de agendamento

### Dicas
- Use o modo de teste nas configurações para filtrar apenas seu número
- Verifique os logs do servidor para ver o processamento detalhado
- Teste diferentes fluxos: agendamento, consulta, cancelamento
- Use o diagnóstico para verificar se a API está configurada corretamente
- Use o teste de envio direto para isolar problemas de envio

### Solução de Problemas
Se o bot não responde:
1. **Verifique a configuração:** Use o diagnóstico em `/admin/diagnostico-whatsapp`
2. **Teste envio direto:** Use `/admin/testar-envio` para testar a API diretamente
3. **Verifique os logs:** Olhe os logs para ver se há erros de API
4. **Configure a API Key:** Certifique-se de que WASENDER_API_KEY está configurada
5. **Verifique o formato do número:** Deve ser DDI + DDD + número (ex: 5511944400696)

## Serviço de Upload de Imagens (Cloudinary + Fallback Local)

### Configuração
O sistema usa Cloudinary para hospedar imagens enviadas via WhatsApp (como calendários), com fallback automático para armazenamento local.

**Credenciais necessárias:**
```bash
# Cloudinary (upload de imagens)
# Obtenha suas credenciais em: https://cloudinary.com/console
CLOUDINARY_CLOUD_NAME="seu-cloud-name"
CLOUDINARY_API_KEY="sua-api-key"
CLOUDINARY_API_SECRET="sua-api-secret"
```

**Como obter credenciais:**
1. Acesse: https://cloudinary.com
2. Crie uma conta gratuita (25GB armazenamento, 25GB transferência/mês)
3. No dashboard, copie:
   - Cloud Name (topo da página)
   - API Key (Account Details → API Key)
   - API Secret (Account Details → API Secret)

**Funcionamento:**
- O sistema tenta upload para Cloudinary primeiro
- Se Cloudinary falhar ou não estiver configurado, usa fallback local (diretório public/tmp)
- Imagens são otimizadas automaticamente (largura 1080px, qualidade auto)
- URLs públicas são retornadas para envio via WhatsApp
- Timeout de 5 segundos para evitar travamentos se Cloudinary estiver lento

**Testar configuração:**
```bash
# Teste completo do fluxo de calendário
npx tsx test-calendar-upload.ts

# Teste específico do Cloudinary
npx tsx test-cloudinary-upload.ts
```

**Status atual:**
- ✅ Sistema configurado e funcionando
- ✅ Fallback local operacional
- ⚠️ Cloudinary configurado mas com erro 403 (restrição de conta)
- 💡 Sistema usa armazenamento local automaticamente quando Cloudinary falha

**Arquivos relacionados:**
- `src/lib/image-upload.ts` - Módulo de upload Cloudinary
- `src/lib/calendar-converter.ts` - Integração com conversão de calendários
- `test-cloudinary-upload.ts` - Script de teste Cloudinary
- `test-calendar-upload.ts` - Script de teste completo do fluxo

## Variáveis de Ambiente Importantes

```bash
# Database (production - Vercel/Supabase)
DATABASE_URL=postgresql://postgres.SEU_REF:SENHA@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&sslmode=require

# Database (local development)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/estetica_automotiva?schema=public

# WhatsApp API
WASENDER_API_KEY=sua-chave-wasender-api
WASENDER_WEBHOOK_SECRET=sua-chave-webhook-secret

# Cloudinary (upload de imagens)
CLOUDINARY_CLOUD_NAME=seu-cloud-name
CLOUDINARY_API_KEY=sua-api-key
CLOUDINARY_API_SECRET=sua-api-secret

# Autenticação
JWT_SECRET=sua-chave-secreta-muito-segura-aqui

# URL da aplicação
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Notas de Deploy

1. **Vercel:** O pool de conexões deve ser maior que 1 para lidar com concorrência
2. **Supabase:** Use sempre o pooler (porta 6543) com `pgbouncer=true`
3. **Cold starts:** O timeout de segurança de 30s no debouncing evita travamentos
4. **Logs:** Mantenha logs detalhados em desenvolvimento para debug

## Limite Diário da WasenderAPI vs Rate Limit Temporário

### Problema
A WasenderAPI retorna erro 429 em duas situações diferentes:
1. **Rate limit temporário:** Muitas requisições em curto período (deve aguardar e retry)
2. **Limite diário:** Atingiu 50 mensagens do plano de teste (não adianta retry)

O código anterior tratava todos os erros 429 como rate limit temporário, enfileirando mensagens que nunca seriam enviadas quando era o limite diário.

### Solução Aplicada
1. **Atualizado `src/lib/evolution-api.ts`:**
   - Detecta quando o erro 429 é devido a limite diário (verifica se a mensagem contém "daily" ou "trial cap")
   - Quando é limite diário, retorna erro imediatamente sem enfileirar
   - Quando é rate limit temporário, continua enfileirando como antes

2. **Atualizado `src/app/api/admin/teste-fluxo/route.ts`:**
   - Detecta quando o retorno indica limite diário
   - Retorna mensagem específica informando sobre o limite de 50 mensagens

3. **Atualizado `src/app/admin/teste-fluxo/page.tsx`:**
   - Adiciona aviso visível sobre limite diário da API
   - Trata erros de limite diário especificamente nos logs

4. **Atualizado `src/app/api/admin/diagnostico/test-connection/route.ts`:**
   - Detecta limite diário durante diagnóstico
   - Retorna status específico para limite diário

5. **Atualizado `src/app/admin/diagnostico-whatsapp/page.tsx`:**
   - Mostra status específico do limite diário nos resultados do diagnóstico

### Como Verificar
- Use o diagnóstico em `/admin/diagnostico-whatsapp` para verificar o status da API
- Se mostrar "Limite diário pode ter sido atingido", aguarde o reset diário ou faça upgrade
- A página de teste de fluxo agora mostra aviso sobre o limite de 50 mensagens/dia
