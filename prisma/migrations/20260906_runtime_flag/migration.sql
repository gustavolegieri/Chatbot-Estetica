CREATE TABLE IF NOT EXISTS "RuntimeFlag" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RuntimeFlag_pkey" PRIMARY KEY ("key")
);
