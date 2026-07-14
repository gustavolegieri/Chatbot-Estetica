# Configurações Importantes para Desenvolvimento

## Problemas de Conexão do Prisma

### Problema Original
O pool de conexões do Prisma estava configurado com `connection_limit=1`, causando timeouts quando múltiplas requisições webhook chegavam simultaneamente:

```
Error [PrismaClientKnownRequestError]: 
Timed out fetching a new connection from the connection pool. 
(Current connection pool timeout: 10, connection limit: 1)
```

### Solução Aplicada
1. **Aumentado pool de conexões em `src/lib/prisma.ts`:**
   - Adicionado `connectionLimit: 10` na configuração do PrismaClient
   - Isso permite lidar com requisições simultâneas em ambiente serverless (Vercel)

2. **Atualizado `.env.example`:**
   - Mudado de `connection_limit=1` para `connection_limit=10` na DATABASE_URL

### Configuração Recomendada
Para produção em Vercel/Supabase:
```
DATABASE_URL=postgresql://postgres.SEU_REF:SENHA@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=10&sslmode=require
```

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

### Mensagens de Teste Comuns
- `"Oi"` ou `"Olá"` - Inicia o fluxo de boas-vindas
- `"menu"` - Volta ao menu principal
- `"1"`, `"2"`, etc. - Seleciona opções numeradas
- `"agendar"` - Inicia fluxo de agendamento

### Dicas
- Use o modo de teste nas configurações para filtrar apenas seu número
- Verifique os logs do servidor para ver o processamento detalhado
- Teste diferentes fluxos: agendamento, consulta, cancelamento

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
