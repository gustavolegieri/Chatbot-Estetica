import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { layoutForSeed, shortenStoryCopy, STORY_H, STORY_W, wrapText } from "./instagram-story";
import { nowInSaoPaulo, slotForPublishTime } from "./instagram-automation";

test("agenda gratuita mapeia manhã, tarde e noite", () => {
  const times = ["09:00", "14:00", "19:00"];
  assert.equal(slotForPublishTime(times, "09:42"), "manha");
  assert.equal(slotForPublishTime(times, "14:01"), "tarde");
  assert.equal(slotForPublishTime(times, "19:59"), "noite");
  assert.equal(slotForPublishTime(times, "12:00"), null);
});

test("horário é calculado no fuso de São Paulo", () => {
  const value = nowInSaoPaulo(new Date("2026-08-23T12:15:00.000Z"));
  assert.deepEqual(value, { date: "2026-08-23", hour: 9, minute: 15, hhmm: "09:15" });
});

test("copy longa é limitada e o layout varia pelo conteúdo", () => {
  const copy = shortenStoryCopy("A".repeat(70), "B".repeat(80));
  assert.ok(copy.title.length <= 48);
  assert.ok(copy.subtitle.length <= 56);
  assert.ok(wrapText("Cuidados automotivos que preservam a pintura por mais tempo", 600, 64, 3).length <= 3);
  const layouts = new Set(Array.from({ length: 50 }, (_, index) => layoutForSeed(`story-${index}`)));
  assert.ok(layouts.size >= 2);
});

test("exemplos finais respeitam o formato 1080x1920", async () => {
  const dir = path.join(process.cwd(), "public", "story-examples");
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith(".jpg"));
  assert.equal(files.length, 5);
  for (const file of files) {
    const metadata = await sharp(path.join(dir, file)).metadata();
    assert.equal(metadata.width, STORY_W);
    assert.equal(metadata.height, STORY_H);
    assert.equal(metadata.format, "jpeg");
  }
});
