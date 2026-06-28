# Supabase + Vercel (Prisma)

## Por que `db.*.supabase.co` falha na Vercel

O host `db.rifvdutsxappnlroennh.supabase.co` costuma ser **só IPv6**. No seu PC funciona; na **Vercel (IPv4)** o `/api/health` fica com `db: false`.

Use o **Supavisor (pooler)** com usuário `postgres.PROJECT_REF`:

```env
DATABASE_URL=postgresql://postgres.rifvdutsxappnlroennh:SUA_SENHA%23@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&sslmode=require
```

- `#` na senha → `%23`
- Copie a região exata em **Supabase → Connect → Transaction pooler** (este projeto: `aws-1-us-east-1`)

## No PC

```env
DATABASE_URL=...pooler...6543...?pgbouncer=true...
DIRECT_URL=postgresql://postgres:...@db.rifvdutsxappnlroennh.supabase.co:5432/postgres?sslmode=require
```

```bash
npx prisma db push
npm run db:seed
```

Admin: `admin@estetica.com` / `admin123`

## Vercel

1. `DATABASE_URL` = pooler (acima), **sem aspas**
2. `JWT_SECRET` e `NEXT_PUBLIC_APP_URL` = `https://chatbot-estetica-ten.vercel.app`
3. **Redeploy** após mudar env

Teste: `https://chatbot-estetica-ten.vercel.app/api/health` → `"ok":true`

## Achar a região do pooler

```bash
node scripts/find-pooler-region.mjs
```
