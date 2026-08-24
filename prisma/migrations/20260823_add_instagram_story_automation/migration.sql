CREATE TABLE "InstagramAutomation" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "publishTimes" TEXT NOT NULL DEFAULT '09:00,14:00,19:00',
    "rotationCategories" TEXT NOT NULL DEFAULT 'curiosidade,dica,bastidor,enquete,lavagem,polimento,higienizacao,promocao,antes_depois,agenda_vaga',
    "blockRepeatDays" INTEGER NOT NULL DEFAULT 7,
    "vacantSlotsCampaign" BOOLEAN NOT NULL DEFAULT true,
    "ctaText" TEXT NOT NULL DEFAULT 'Agende pelo WhatsApp',
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstagramAutomation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstagramStoryAsset" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'geral',
    "title" TEXT,
    "caption" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageUrlAfter" TEXT,
    "imageData" BYTEA,
    "imageDataAfter" BYTEA,
    "imageMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "imageMimeAfter" TEXT,
    "publicToken" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstagramStoryAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstagramStoryPost" (
    "id" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "imageData" BYTEA,
    "imageMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "publicToken" TEXT,
    "mediaId" TEXT,
    "creationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "reach" INTEGER,
    "impressions" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InstagramStoryPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstagramStoryAsset_publicToken_key" ON "InstagramStoryAsset"("publicToken");
CREATE INDEX "InstagramStoryAsset_active_category_idx" ON "InstagramStoryAsset"("active", "category");
CREATE INDEX "InstagramStoryAsset_type_active_idx" ON "InstagramStoryAsset"("type", "active");
CREATE UNIQUE INDEX "InstagramStoryPost_publicToken_key" ON "InstagramStoryPost"("publicToken");
CREATE INDEX "InstagramStoryPost_contentKey_publishedAt_idx" ON "InstagramStoryPost"("contentKey", "publishedAt");
CREATE INDEX "InstagramStoryPost_status_createdAt_idx" ON "InstagramStoryPost"("status", "createdAt");
CREATE INDEX "InstagramStoryPost_slot_publishedAt_idx" ON "InstagramStoryPost"("slot", "publishedAt");
CREATE INDEX "InstagramStoryPost_publishedAt_idx" ON "InstagramStoryPost"("publishedAt");
