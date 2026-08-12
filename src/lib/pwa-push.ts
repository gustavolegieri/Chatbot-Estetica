import crypto from "node:crypto";
import webpush from "web-push";
import { prisma } from "@/lib/prisma";

const P256_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}

function derivePrivateKey(secret: string) {
  const digest = crypto.createHash("sha256").update(`garagem-ka-web-push:${secret}`).digest();
  const one = BigInt(1);
  const scalar = (BigInt(`0x${digest.toString("hex")}`) % (P256_ORDER - one)) + one;
  return Buffer.from(scalar.toString(16).padStart(64, "0"), "hex");
}

export function getVapidKeys() {
  const configuredPublic = process.env.VAPID_PUBLIC_KEY?.trim();
  const configuredPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  if (configuredPublic && configuredPrivate) return { publicKey: configuredPublic, privateKey: configuredPrivate };

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) return null;
  const privateBuffer = derivePrivateKey(secret);
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(privateBuffer);
  return {
    privateKey: toBase64Url(privateBuffer),
    publicKey: toBase64Url(ecdh.getPublicKey(undefined, "uncompressed")),
  };
}

function configureWebPush() {
  const keys = getVapidKeys();
  if (!keys) return null;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:admin@garagemdoka.com.br", keys.publicKey, keys.privateKey);
  return keys;
}

async function sendPushPayload(payload: Record<string, unknown>, urgency: "very-low" | "low" | "normal" | "high" = "normal") {
  if (!configureWebPush()) return { sent: 0, configured: false };
  const subscriptions = await prisma.pwaPushSubscription.findMany();
  if (!subscriptions.length) return { sent: 0, configured: true };

  let sent = 0;
  await Promise.allSettled(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({ icon: "/pwa/icon-192.png", ...payload }), { TTL: 120, urgency });
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pwaPushSubscription.delete({ where: { id: subscription.id } }).catch(() => undefined);
      }
    }
  }));
  return { sent, configured: true };
}

export async function notifyPwaOperationalAlert(input: {
  title: string;
  body: string;
  tag: string;
  url?: string;
  urgency?: "very-low" | "low" | "normal" | "high";
}) {
  try {
    return await sendPushPayload({
      title: input.title,
      body: input.body.trim().slice(0, 180),
      tag: input.tag,
      url: input.url || "/admin/mobile?tab=ai",
    }, input.urgency || "normal");
  } catch (error) {
    console.error("[PWA Push] Falha ao enviar alerta operacional", error);
    return { sent: 0, configured: true };
  }
}

export async function notifyPwaAboutWhatsAppMessage(input: { phone: string; body: string }) {
  if (!configureWebPush()) return { sent: 0, configured: false };

  try {
    const conversation = await prisma.whatsAppSession.findUnique({ where: { phone: input.phone }, include: { client: true } });

    const metadata = conversation?.metadata && typeof conversation.metadata === "object" && !Array.isArray(conversation.metadata)
      ? conversation.metadata as Record<string, unknown>
      : {};
    const name = conversation?.client?.name || (typeof metadata.customerName === "string" ? metadata.customerName : null) || "Novo cliente";
    const ai = metadata.aiIntelligence && typeof metadata.aiIntelligence === "object" && !Array.isArray(metadata.aiIntelligence)
      ? metadata.aiIntelligence as Record<string, unknown>
      : null;
    const priority = ai?.needsHuman === true || ai?.urgency === "critical" || ai?.urgency === "high";
    const score = typeof ai?.leadScore === "number" ? ai.leadScore : null;
    const title = priority ? `Prioridade · ${name}` : score !== null && score >= 75 ? `Lead quente · ${name}` : name;
    return await sendPushPayload({
      title,
      body: input.body.trim().slice(0, 180) || "Nova mensagem recebida",
      tag: `conversation-${input.phone}`,
      url: `/admin/mobile?phone=${encodeURIComponent(input.phone)}`,
    }, priority ? "high" : "normal");
  } catch (error) {
    console.error("[PWA Push] Falha ao notificar aplicativos", error);
    return { sent: 0, configured: true };
  }
}
