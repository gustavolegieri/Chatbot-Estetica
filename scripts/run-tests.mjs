import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return collect(full);
    return /\.test\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const files = collect(join(process.cwd(), "src"));
if (!files.length) {
  console.error("Nenhum teste encontrado em src.");
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
