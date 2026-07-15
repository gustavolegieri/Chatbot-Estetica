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
- **Processamento assíncrono:** Webhook responde imediatamente e processa em background
- **Logs reduzidos:** Removidos logs excessivos para reduzir overhead no Vercel

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

## Variáveis de Ambiente Importantes

```bash
# Database (production - Vercel/Supabase)
DATABASE_URL=postgresql://postgres.SEU_REF:SENHA@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&sslmode=require

# Database (local development)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/estetica_automotiva?schema=public

# WhatsApp API
WASENDER_API_KEY=sua-chave-wasender-api
WASENDER_WEBHOOK_SECRET=sua-chave-webhook-secret

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
