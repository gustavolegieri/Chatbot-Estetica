# Estética Automotiva - Sistema de Gestão

Sistema completo para gestão de estética automotiva com painel administrativo e agendamento via WhatsApp (Evolution API).

## Tecnologias

- **Next.js 15** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **PostgreSQL**
- **Prisma ORM**
- **Evolution API** (WhatsApp)

## Funcionalidades

### Painel Admin
- Login com JWT (cookie httpOnly)
- Dashboard com métricas
- Gestão de clientes
- Gestão de serviços
- Gestão de agendamentos
- Módulo financeiro (receitas/despesas)
- Configurações do negócio e WhatsApp

### WhatsApp Bot
- Mensagem de boas-vindas com botões
- Agendamento: serviço → data → horário → confirmação
- Consulta de agendamentos
- Cancelamento por código
- Reagendamento

## Pré-requisitos

- Node.js 18+
- PostgreSQL 14+
- Evolution API (opcional, para WhatsApp)

## Instalação

```bash
# 1. Clone ou acesse o diretório do projeto
cd estetica-automotiva

# 2. Instale dependências
npm install

# 3. Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# 4. Suba o PostgreSQL (Docker)
docker compose up -d

# 5. Execute migrations e seed
npx prisma db push
npm run db:seed

# 6. Inicie o servidor
npm run dev
```

Acesse: **http://localhost:3000**

### Credenciais padrão (seed)
- **E-mail:** admin@estetica.com
- **Senha:** admin123

## Estrutura do Projeto

```
estetica-automotiva/
├── prisma/
│   ├── schema.prisma      # Modelos do banco
│   └── seed.ts            # Dados iniciais
├── src/
│   ├── app/
│   │   ├── admin/         # Telas do painel
│   │   └── api/           # Rotas da API
│   ├── components/        # Componentes React
│   ├── lib/               # Lógica de negócio
│   └── types/             # Tipos TypeScript
├── docs/                  # Documentação detalhada
└── docker-compose.yml     # PostgreSQL local
```

## Documentação

- [Banco de Dados](docs/DATABASE.md)
- [API REST](docs/API.md)
- [Integração WhatsApp](docs/WHATSAPP.md)
- [Deploy 24/7 (produção)](docs/DEPLOY.md)
- [Deploy gratuito 24/7](docs/DEPLOY-GRATUITO.md)

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run db:push` | Sincroniza schema com o banco |
| `npm run db:seed` | Popula dados iniciais |
| `npm run db:studio` | Interface visual do Prisma |

## Licença

MIT
