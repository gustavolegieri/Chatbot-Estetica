import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env");
const env = fs.readFileSync(envPath, "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) {
  console.log("NO_URL");
  process.exit(1);
}
let url = m[1].trim().replace(/^["']|["']$/g, "");
const u = new URL(url.replace(/^postgresql:/, "postgres:"));
console.log(
  JSON.stringify(
    {
      host: u.hostname,
      port: u.port || "5432",
      user: u.username,
      hasPooler: u.hostname.includes("pooler"),
      hasPgbouncer: url.includes("pgbouncer"),
      userHasProjectRef: u.username.includes("."),
      isDirectDbHost: u.hostname.startsWith("db.") && u.hostname.includes("supabase.co"),
    },
    null,
    2
  )
);
