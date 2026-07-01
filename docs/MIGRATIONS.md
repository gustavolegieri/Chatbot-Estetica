# Prisma Migrations & Deployment

This project added new Prisma models (Campaign, CampaignQueue, ServiceMedia, etc.). To apply these schema changes you must run migrations locally or on your server.

Local development (recommended):

```bash
# generate a new migration interactively
npx prisma migrate dev --name add-campaigns-media

# regenerate client
npx prisma generate
```

Production / CI:

```bash
# create migration locally and commit migration files, then on production:
npx prisma migrate deploy
npx prisma generate
```

Notes:
- Back up your database before running migrations on production.
- If you are using a hosted DB that requires SSL or special connection strings, ensure `DATABASE_URL` and `DIRECT_URL` are set in your environment.
- After migrations, restart the Next.js server.

Additional considerations:
- The campaign processor implemented in `src/lib/campaign-processor.ts` runs in-memory. For high availability consider using a persistent queue (Redis + BullMQ) or run a dedicated worker process to avoid losing progress on restarts.
- Files uploaded via `/api/midia` are saved to `public/uploads`. For production use, consider moving to cloud storage (S3, GCS) and storing signed URLs.
