CREATE TABLE IF NOT EXISTS "CardCache" (
    "hash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CardCache_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX IF NOT EXISTS "CardCache_kind_idx" ON "CardCache"("kind");
