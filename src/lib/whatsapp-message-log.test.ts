import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "./prisma";
import { logWhatsAppMessage } from "./whatsapp-message-log";
import { MessageDirection, MessageSender } from "./message-enums";

test("reuses the webhook dedup marker instead of creating a duplicate inbound message", async () => {
  const originalUpsert = prisma.whatsAppMessage.upsert;
  const originalCreate = prisma.whatsAppMessage.create;
  const originalSessionUpdate = prisma.whatsAppSession.update;
  let upserts = 0;
  let creates = 0;

  (prisma.whatsAppMessage as any).upsert = async ({ create, update }: any) => {
    upserts += 1;
    assert.equal(create.wasenderMessageId, "wa-message-1");
    assert.equal(update.body, "🎙️ Qual valor do polimento?");
    return { id: "message-1", createdAt: new Date("2026-08-04T12:55:00Z") };
  };
  (prisma.whatsAppMessage as any).create = async () => {
    creates += 1;
    throw new Error("create must not be used when a Wasender id exists");
  };
  (prisma.whatsAppSession as any).update = async () => ({ id: "session-1" });

  try {
    await logWhatsAppMessage({
      phone: "5511972851072",
      sessionId: "session-1",
      direction: MessageDirection.INBOUND,
      sender: MessageSender.CLIENT,
      body: "🎙️ Qual valor do polimento?",
      flowStage: "ETAPA2_MAIN_MENU",
      wasenderMessageId: "wa-message-1",
    });
    assert.equal(upserts, 1);
    assert.equal(creates, 0);
  } finally {
    (prisma.whatsAppMessage as any).upsert = originalUpsert;
    (prisma.whatsAppMessage as any).create = originalCreate;
    (prisma.whatsAppSession as any).update = originalSessionUpdate;
  }
});
