-- Antes/depois automatico a partir da camera do portao + motor de recorrencia.
-- Escrito com IF NOT EXISTS porque o projeto tambem usa `prisma db push`,
-- entao a migracao pode ser aplicada sobre um banco que ja recebeu as colunas.

ALTER TABLE "Settings"
  ADD COLUMN IF NOT EXISTS "beforeAfterEnabled"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "beforeAfterInstagram"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrenceEnabled"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrenceMaxPerDay"   INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "recurrenceQuietDays"   INTEGER NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS "recurrenceWindowStart" TEXT    NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS "recurrenceWindowEnd"   TEXT    NOT NULL DEFAULT '19:00';

ALTER TABLE "Service"
  ADD COLUMN IF NOT EXISTS "recurrenceDays" INTEGER,
  ADD COLUMN IF NOT EXISTS "warrantyDays"   INTEGER;

ALTER TABLE "Appointment"
  ADD COLUMN IF NOT EXISTS "beforeAfterUrl"       TEXT,
  ADD COLUMN IF NOT EXISTS "recurrenceNotifiedAt" TIMESTAMP(3);

-- A busca do motor de recorrencia varre atendimentos concluidos por cliente.
CREATE INDEX IF NOT EXISTS "Appointment_status_date_idx" ON "Appointment" ("status", "date");
