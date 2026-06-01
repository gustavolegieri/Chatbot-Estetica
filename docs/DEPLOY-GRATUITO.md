# Deploy gratuito 24/7

O bot precisa de **servidor sempre ligado** (Evolution + banco + app). Plano “só hospedar site” (Vercel/Netlify grátis) **não serve** sozinho — o WhatsApp exige a Evolution rodando o tempo todo.

---

## Sem cartão de crédito

Oracle, AWS, Google Cloud e Azure **pedem cartão** na cadastro (mesmo no tier grátis). Sem cartão, use uma destas opções:

### Opção A — PC ligado 24h em casa (100% grátis, sem cartão)

É o que mais funciona no Brasil sem cartão:

1. Deixe o PC/notebook **ligado** (energia e Wi‑Fi estáveis).
2. Docker Desktop aberto ao iniciar o Windows.
3. No projeto:

```powershell
docker compose up -d
npm run build
npm run start
.\scripts\start-webhook-dev.ps1
```

4. Webhook local: `host.docker.internal:3000` (já usado no script).

**Limitações:** queda de luz, reinício do Windows, IP pode mudar. Para HTTPS estável sem cartão, crie conta grátis no [Cloudflare](https://www.cloudflare.com/) (sem cartão) e use **Cloudflare Tunnel** apontando para `localhost:3000`.

### Opção B — GitHub antigo + ClawCloud (sem cartão)

[ClawCloud](https://run.claw.cloud/) costuma dar crédito mensal para contas **GitHub com mais de 6 meses**. Vale testar se ainda aceita cadastro só com GitHub, sem cartão.

### Opção C — E-mail de estudante (.edu / .ac)

Alguns provedores “free for students” aceitam só e-mail institucional, sem cartão — ex.: [FreeVPS.edu.pl](https://freevps.edu.pl/) (verifique os termos atuais).

### Opção D — Sites “VPS grátis sem cartão”

Existem vários (FreeVPS.it, GratisVPS, etc.). **Cuidado:** muitos são instáveis, lentos ou temporários. Use só para teste, não para cliente real.

### O que evitar prometer ao cliente

Sem VPS na nuvem, você **não tem garantia** de 99% uptime. Seja honesto: “bot depende do computador da loja ligado” ou invista depois em VPS pago (~R$ 30/mês).

---

## Melhor opção grátis (com cartão): Oracle Cloud (Always Free)

A Oracle oferece VPS **grátis para sempre** (não é só 12 meses), suficiente para este projeto:

- Até **4 GB RAM** (VM ARM) ou micro AMD
- IP público fixo
- Roda Docker com tudo: Postgres + Redis + Evolution + seu app

Site: [https://www.oracle.com/cloud/free/](https://www.oracle.com/cloud/free/)

### Passo a passo (resumo)

1. Criar conta Oracle Cloud (pede cartão para verificação, **não cobra** se ficar no Always Free).
2. Criar VM **Ubuntu 22/24** (shape **Ampere A1** — Always Free).
3. Abrir portas no firewall da Oracle: **22** (SSH), **80**, **443** (HTTPS).
4. Conectar por SSH e instalar Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

5. Clonar o projeto e configurar `.env` (copie de `.env.production.example`).
6. Subir:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npx prisma db push
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

7. HTTPS grátis com **Caddy** ou **Certbot** + domínio (veja abaixo).

Guia completo pago/grátis geral: [DEPLOY.md](./DEPLOY.md)

---

## Domínio e HTTPS de graça

| Recurso | Custo | Uso |
|---------|-------|-----|
| [DuckDNS](https://www.duckdns.org/) | Grátis | `suaoficina.duckdns.org` apontando pro IP da Oracle |
| [Cloudflare](https://www.cloudflare.com/) | Grátis | DNS + proxy (se você tiver um domínio) |
| **Let's Encrypt** | Grátis | Certificado SSL no Caddy/Certbot |

Webhook em produção: `https://seu-dominio.duckdns.org/api/whatsapp/webhook`

---

## O que NÃO funciona bem de graça

| Serviço | Problema |
|---------|----------|
| **Vercel / Netlify** (só Next.js) | Evolution não roda lá; webhook precisa de backend 24h |
| **Render / Railway** (free) | Créditos acabam ou serviço “dorme” → bot para |
| **ngrok free** | URL muda / limite → webhook quebra |
| **PC em casa** | “Grátis”, mas luz/internet/PC ligado 24h — cai fácil |

---

## Alternativa “zero custo” (menos confiável)

**PC ou notebook ligado 24h** em casa + Docker:

```powershell
docker compose -f docker-compose.prod.yml up -d
npm run dev   # ou build + start em produção
.\scripts\start-webhook-dev.ps1
```

Problemas: queda de energia, Wi‑Fi, IP que muda, Windows reiniciando.

---

## Divisão híbrida (avançado)

| Peça | Onde (grátis) |
|------|----------------|
| Banco | [Neon](https://neon.tech) ou [Supabase](https://supabase.com) (tier free) |
| App Next.js | Vercel (free) |
| Evolution API | **Ainda precisa** de VM grátis (Oracle) |

Mais complexo de configurar; para este projeto, **tudo na Oracle em Docker** é mais simples.

---

## Depois de subir na Oracle

1. Manager Evolution: `http://SEU-IP:8080/manager` (ou proteja com senha/firewall).
2. Conectar WhatsApp (QR).
3. Webhook:

```bash
curl -X POST "http://127.0.0.1:8080/webhook/set/estetica" \
  -H "apikey: SUA_EVOLUTION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"https://SEU-DOMINIO/api/whatsapp/webhook","events":["MESSAGES_UPSERT"]}}'
```

4. Monitorar grátis: [UptimeRobot](https://uptimerobot.com/) (5 minutos).

---

## Resumo

| Objetivo | Caminho |
|----------|---------|
| **24/7 de graça de verdade** | Oracle Cloud Always Free + Docker |
| **HTTPS + webhook** | DuckDNS + Caddy (grátis) |
| **Só testar** | PC local (como hoje) |

Custo mensal: **R$ 0** (se ficar só no tier Always Free da Oracle).
