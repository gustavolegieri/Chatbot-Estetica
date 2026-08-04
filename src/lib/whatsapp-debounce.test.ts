import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "./prisma";
import { enqueueWhatsAppMessage } from "./whatsapp-debounce";

test("serializes rapid messages without dropping or leaving promises pending", async () => {
  const originalUpdateMany = prisma.whatsAppSession.updateMany;
  const originalUpdate = prisma.whatsAppSession.update;
  const originalFindUnique = prisma.whatsAppSession.findUnique;
  const originalCreate = prisma.whatsAppSession.create;
  const events: string[] = [];

  (prisma.whatsAppSession.updateMany as any) = async () => ({ count: 1 });
  (prisma.whatsAppSession.update as any) = async () => ({ id: "session" });
  (prisma.whatsAppSession.findUnique as any) = async () => ({ phone: "5511999999999" });
  (prisma.whatsAppSession.create as any) = async () => ({ id: "session" });

  try {
    const handler = async ({ text }: { text: string }) => {
      events.push(`start:${text}`);
      await new Promise<void>((resolve) => setTimeout(resolve, text === "primeira" ? 20 : 1));
      events.push(`end:${text}`);
    };

    const first = enqueueWhatsAppMessage(
      { phone: "5511999999999", text: "primeira", messageId: "m1" },
      handler
    );
    const second = enqueueWhatsAppMessage(
      { phone: "5511999999999", text: "segunda", messageId: "m2" },
      handler
    );

    await Promise.all([first, second]);
    assert.deepEqual(events, ["start:primeira", "end:primeira", "start:segunda", "end:segunda"]);
  } finally {
    (prisma.whatsAppSession.updateMany as any) = originalUpdateMany;
    (prisma.whatsAppSession.update as any) = originalUpdate;
    (prisma.whatsAppSession.findUnique as any) = originalFindUnique;
    (prisma.whatsAppSession.create as any) = originalCreate;
  }
});
