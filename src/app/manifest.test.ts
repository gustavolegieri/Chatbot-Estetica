import assert from "node:assert/strict";
import test from "node:test";
import manifest from "./manifest";

test("PWA manifest opens the protected mobile workspace as a standalone app", () => {
  const value = manifest();
  assert.equal(value.start_url, "/admin/mobile");
  assert.equal(value.display, "standalone");
  assert.equal(value.theme_color, "#0b1f17");
  assert.ok(value.icons?.some((icon) => icon.sizes === "192x192"));
  assert.ok(value.icons?.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
});
