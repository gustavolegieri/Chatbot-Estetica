import fs from "fs";
const env = fs.readFileSync(".env", "utf8");
const m = env.match(/^DATABASE_URL=(.+)$/m);
if (!m) process.exit(1);
process.stdout.write(m[1].trim());
