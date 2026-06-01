# Rodar 24 horas (produção)

No seu PC (`npm run dev`) o sistema **para** quando você desliga o computador ou fecha o terminal. Para **24/7 sem cair**, use um **servidor na nuvem (VPS)** sempre ligado.

## O que precisa ficar ligado o tempo todo

| Serviço | Função |
|---------|--------|
| **App Next.js** | Painel admin + webhook do bot |
| **PostgreSQL** | Dados (clientes, agendamentos, config) |
| **Evolution API** | WhatsApp conectado |
| **Redis** | Cache da Evolution |

Todos com `restart: always` no Docker — se o servidor reiniciar, os containers sobem de novo.

---

## Opção recomendada: VPS + Docker

### 1. Contratar um servidor

Exemplos (pagos, ~R$ 30–80/mês):

- [Hostinger VPS](https://www.hostinger.com.br/vps-hosting)
- [DigitalOcean](https://www.digitalocean.com/)
- [Hetzner](https://www.hetzner.com/)
- [AWS Lightsail](https://aws.amazon.com/lightsail/)

Mínimo sugerido: **2 GB RAM**, **2 vCPU**, Ubuntu 22/24.

### 2. Instalar Docker no servidor

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# sair e entrar de novo no SSH
```

### 3. Enviar o projeto

```bash
git clone SEU_REPOSITORIO estetica-automotiva
cd estetica-automotiva
```

Ou copie os arquivos por SFTP.

### 4. Configurar `.env` de produção

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=senha-forte-aleatoria
DATABASE_URL=postgresql://postgres:senha-forte-aleatoria@postgres:5432/estetica_automotiva?schema=public

JWT_SECRET=chave-longa-aleatoria-min-32-chars
NEXT_PUBLIC_APP_URL=https://seudominio.com.br

EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=outra-chave-forte
EVOLUTION_INSTANCE_NAME=estetica
EVOLUTION_PUBLIC_URL=https://seudominio.com.br
```

### 5. Subir tudo

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npx prisma db push
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

### 6. HTTPS (obrigatório para confiança e webhook estável)

Use **Caddy** ou **Nginx** na frente:

- `https://seudominio.com.br` → app (porta 3000)
- Manager Evolution: só você acessa (porta 8080 no servidor, firewall)

### 7. Webhook em produção

Dentro da rede Docker, configure:

```
https://seudominio.com.br/api/whatsapp/webhook
```

```bash
curl -X POST "http://127.0.0.1:8080/webhook/set/estetica" \
  -H "apikey: SUA_EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"https://seudominio.com.br/api/whatsapp/webhook","events":["MESSAGES_UPSERT"]}}'
```

### 8. Conectar WhatsApp (uma vez)

Acesse o Manager (túnel SSH ou subdomínio protegido), escaneie o QR. Se desconectar, reconecte pelo Manager.

---

## Manter no ar (não cair)

### Reinício automático

No `docker-compose.prod.yml` já está `restart: always`. Após reboot do VPS:

```bash
cd estetica-automotiva && docker compose -f docker-compose.prod.yml up -d
```

(Pode colocar isso no `@reboot` do cron.)

### Atualizar o sistema

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Backup do banco (importante)

Diário, exemplo:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres estetica_automotiva > backup_$(date +%F).sql
```

### Monitorar se caiu

Serviços gratuitos que avisam por e-mail/Telegram se o site ficar fora:

- [UptimeRobot](https://uptimerobot.com/)
- [Better Stack](https://betterstack.com/)

Monitore: `https://seudominio.com.br/api/whatsapp/webhook` (GET deve responder).

### WhatsApp desconectou?

A Evolution pode perder sessão. Verifique no Manager status **open**. Configure alerta manual ou script que checa `/instance/connectionState/estetica`.

---

## O que NÃO usar em produção

| Evitar | Motivo |
|--------|--------|
| PC de casa | Desliga, IP muda, internet cai |
| `npm run dev` | Modo desenvolvimento, instável |
| `host.docker.internal` | Só funciona no Windows/Mac local |
| ngrok gratuito | URL muda, sessão expira |

---

## Resumo

```text
[VPS 24h ligado]
     │
     ├── Docker: postgres + redis + evolution + app
     │
     ├── HTTPS (Caddy/Nginx)
     │
     └── Webhook → https://seu-dominio/api/whatsapp/webhook
```

**Custo típico:** VPS + domínio (~R$ 40–100/mês).  
**Seu trabalho:** deploy inicial, backup, reconectar WhatsApp se cair sessão.

Para deploy assistido no servidor, tenha em mãos: domínio, acesso SSH e as chaves do `.env`.
