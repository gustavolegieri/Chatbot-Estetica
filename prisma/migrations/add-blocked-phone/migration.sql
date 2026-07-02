-- CreateTable
CREATE TABLE "BlockedPhone" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'Bloqueado pelo administrador',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedPhone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BlockedPhone_phone_key" ON "BlockedPhone"("phone");

