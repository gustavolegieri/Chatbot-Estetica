CREATE TABLE "GateLiveSession" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "offer" JSONB,
    "answer" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastViewerAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateLiveSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GateLiveSession_tokenHash_key" ON "GateLiveSession"("tokenHash");
CREATE INDEX "GateLiveSession_appointmentId_idx" ON "GateLiveSession"("appointmentId");
CREATE INDEX "GateLiveSession_deviceId_status_idx" ON "GateLiveSession"("deviceId", "status");
CREATE INDEX "GateLiveSession_status_expiresAt_idx" ON "GateLiveSession"("status", "expiresAt");

ALTER TABLE "GateLiveSession" ADD CONSTRAINT "GateLiveSession_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
