import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { isInstagramConfigured } from "@/lib/instagram-publish";
import {
  ensureInstagramAutomation,
  previewNextStory,
  publishSelectedStory,
  selectNextStoryContent,
} from "@/lib/instagram-automation";
import { STORY_SLOTS, isStorySlot } from "@/lib/instagram-story";

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  publishTimes: z.string().optional(),
  rotationCategories: z.string().optional(),
  blockRepeatDays: z.number().int().min(1).max(90).optional(),
  vacantSlotsCampaign: z.boolean().optional(),
  ctaText: z.string().min(2).max(120).optional(),
});

const assetSchema = z.object({
  type: z.enum(["before_after", "promo", "custom"]),
  category: z.string().default("geral"),
  title: z.string().optional().nullable(),
  caption: z.string().optional().nullable(),
  imageUrl: z.string().url(),
  imageUrlAfter: z.string().url().optional().nullable(),
  active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const auto = await ensureInstagramAutomation();
  const assets = await prisma.instagramStoryAsset.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, type: true, category: true, title: true, caption: true, imageUrl: true,
      imageUrlAfter: true, active: true, timesUsed: true, lastUsedAt: true, createdAt: true, updatedAt: true,
    },
  });
  const history = await prisma.instagramStoryPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true, slot: true, contentType: true, contentKey: true, title: true, subtitle: true,
      imageUrl: true, mediaId: true, creationId: true, status: true, error: true,
      reach: true, impressions: true, publishedAt: true, createdAt: true,
    },
  });

  const previewSlot = request.nextUrl.searchParams.get("preview_slot") || "manha";
  let preview: unknown = null;
  if (request.nextUrl.searchParams.get("preview") === "1" && isStorySlot(previewSlot)) {
    try {
      const selected = await selectNextStoryContent(previewSlot);
      preview = {
        contentType: selected.contentType,
        category: selected.category,
        title: selected.render.title,
        subtitle: selected.render.subtitle,
        priceLabel: selected.render.priceLabel,
        eyebrow: selected.render.eyebrow,
      };
    } catch (e) {
      preview = { error: e instanceof Error ? e.message : "Falha no preview" };
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      settings: auto,
      configured: isInstagramConfigured(),
      assets,
      history,
      preview,
      slots: STORY_SLOTS,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const body = await request.json();
    const data = settingsSchema.parse(body);
    await ensureInstagramAutomation();
    const updated = await prisma.instagramAutomation.update({
      where: { id: "default" },
      data,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Dados inválidos" }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Erro ao salvar" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  try {
    const contentType = request.headers.get("content-type") || "";

    // Upload de asset (multipart)
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file") as File | null;
      const fileAfter = form.get("fileAfter") as File | null;
      const type = String(form.get("type") || "custom");
      const category = String(form.get("category") || "geral");
      const title = form.get("title")?.toString() || null;
      const caption = form.get("caption")?.toString() || null;

      if (!file) return NextResponse.json({ success: false, error: "Arquivo obrigatório" }, { status: 400 });

      if (file.size > 4_000_000 || (fileAfter && fileAfter.size > 4_000_000)) {
        return NextResponse.json({ success: false, error: "Cada imagem deve ter no máximo 4 MB" }, { status: 400 });
      }

      const optimize = async (input: File) =>
        sharp(Buffer.from(await input.arrayBuffer()))
          .rotate()
          .resize(1440, 1920, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 86, mozjpeg: true })
          .toBuffer();

      const imageData = await optimize(file);

      let imageDataAfter: Buffer | null = null;
      if (fileAfter) {
        imageDataAfter = await optimize(fileAfter);
      }

      const publicToken = randomBytes(24).toString("base64url");
      const asset = await prisma.instagramStoryAsset.create({
        data: {
          type: type === "before_after" || type === "promo" ? type : "custom",
          category,
          title,
          caption,
          imageUrl: `/api/public/instagram-asset/${publicToken}`,
          imageUrlAfter: imageDataAfter ? `/api/public/instagram-asset/${publicToken}?variant=after` : null,
          imageData: Uint8Array.from(imageData),
          imageDataAfter: imageDataAfter ? Uint8Array.from(imageDataAfter) : null,
          imageMime: "image/jpeg",
          imageMimeAfter: imageDataAfter ? "image/jpeg" : null,
          publicToken,
        },
      });
      return NextResponse.json({
        success: true,
        data: { ...asset, imageData: undefined, imageDataAfter: undefined },
      }, { status: 201 });
    }

    const body = await request.json();
    const action = body.action as string | undefined;

    if (action === "preview") {
      const slot = isStorySlot(body.slot) ? body.slot : "manha";
      const preview = await previewNextStory(slot);
      return NextResponse.json({ success: true, data: preview });
    }

    if (action === "publish_now") {
      const slot = isStorySlot(body.slot) ? body.slot : "manha";
      const dryRun = Boolean(body.dry_run);
      const result = await publishSelectedStory(slot, { dryRun });
      return NextResponse.json({ success: true, data: result });
    }

    if (action === "create_asset") {
      const data = assetSchema.parse(body);
      const asset = await prisma.instagramStoryAsset.create({
        data: {
          type: data.type,
          category: data.category,
          title: data.title ?? null,
          caption: data.caption ?? null,
          imageUrl: data.imageUrl,
          imageUrlAfter: data.imageUrlAfter ?? null,
          active: data.active ?? true,
        },
      });
      return NextResponse.json({ success: true, data: asset }, { status: 201 });
    }

    return NextResponse.json({ success: false, error: "Ação inválida" }, { status: 400 });
  } catch (error) {
    console.error("[instagram-automation POST]", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Dados inválidos" }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Não autenticado" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("assetId");
  if (!id) return NextResponse.json({ success: false, error: "assetId obrigatório" }, { status: 400 });

  await prisma.instagramStoryAsset.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ success: true });
}
