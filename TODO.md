# TODO - Bloqueio de números (Chatbot-Estetica)

- [x] Criar model/table `BlockedPhone` no Prisma.
- [x] Adicionar migration SQL para `BlockedPhone`.
- [x] Criar helpers `src/lib/blocked-phones.ts`.
- [x] Implementar checagem de bloqueio no bot: `src/lib/whatsapp-bot.ts`.
- [x] Implementar checagem de bloqueio em reminders: `src/lib/appointment-reminders.ts`.
- [x] Implementar checagem de bloqueio em campanhas: `src/lib/campaign-processor.ts`.
- [x] Criar endpoints admin: `src/app/api/blocked-phones/route.ts` e `[id]/route.ts`.
- [x] Criar página admin: `src/app/admin/bloqueio/page.tsx`.
- [x] Atualizar sidebar com a nova aba: `src/components/layout/Sidebar.tsx`.
- [ ] Rodar `prisma generate` + migrar banco no ambiente (ex.: `prisma migrate dev`).
- [ ] Rodar `npm run build` para validar TypeScript e Next.

