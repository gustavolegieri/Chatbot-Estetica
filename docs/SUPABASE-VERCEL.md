# Supabase + Vercel (Prisma)

## URL que funciona neste projeto

Na **Vercel**, use o **PgBouncer** no host `db.*` (porta **6543**), não a conexão direta na 5432:

```env
DATABASE_URL=postgresql://postgres:SUA_SENHA_URL_ENCODED@db.rifvdutsxappnlroennh.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
```

- Usuário: `postgres` (não `postgres.rifvdutsxappnlroennh` neste formato)
- Senha com `#` → `%23` na URL
- Caminho: `/postgres` + `?` + parâmetros (não cole `sslmode` colado em `postgres`)

## Erros comuns

| Sintoma | Causa |
|--------|--------|
| `db: false` na Vercel | URL com `:5432` no host `db.*` (IPv6; serverless não alcança) |
| `db: false` com env OK | URL malformada, ex.: `...6543/postgressslmode=require` (falta `?`) |
| Pooler `aws-0-...` falha | Região errada — prefira a URL acima (porta 6543 no `db.*`) |

## No PC (migrations / seed)

Mantenha no `.env` local:

```env
# Runtime (igual Vercel)
DATABASE_URL=postgresql://postgres:...@db.rifvdutsxappnlroennh.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require

# Opcional: migrations Prisma (5432 direto, só no PC)
DIRECT_URL=postgresql://postgres:...@db.rifvdutsxappnlroennh.supabase.co:5432/postgres?sslmode=require
```

Depois de conectar:

```bash
npx prisma db push
npm run db:seed
```

Admin: `admin@estetica.com` / `admin123`

## Vercel

1. **Settings → Environment Variables** → `DATABASE_URL` (Production, Preview, Development)
2. **Deployments → Redeploy** (obrigatório após mudar env)
3. Abra `https://SEU-DOMINIO.vercel.app/api/health` → deve retornar `"db":true,"adminUser":true`

## Testar URL localmente

```bash
node scripts/check-db-url.mjs
node scripts/test-pooler.mjs
```
