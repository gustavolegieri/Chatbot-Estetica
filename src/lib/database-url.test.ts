import assert from "node:assert/strict";
import test from "node:test";
import { repairDatabaseUrl } from "./database-url";

test("upgrades legacy connection pools to the webhook-safe limit", () => {
  const repaired = repairDatabaseUrl(
    "postgresql://user:pass@pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=2&sslmode=require"
  );
  assert.match(repaired ?? "", /connection_limit=50/);
  assert.doesNotMatch(repaired ?? "", /connection_limit=2(?:&|$)/);
});

test("adds the webhook-safe connection pool when it is missing", () => {
  const repaired = repairDatabaseUrl(
    "postgresql://user:pass@pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"
  );
  assert.match(repaired ?? "", /connection_limit=50/);
});
