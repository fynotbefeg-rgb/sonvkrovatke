// Offline: job v1 → montagePlan via the Director. No network, no render, no approvals.
// Usage (from roman-reels/pv):
//   node --experimental-strip-types scripts/build-montage-plan.mjs <job.json> [--out <new-file.json>]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildMontagePlan, DIRECTOR_VERSION } from "../src/factory/director.ts";

const [jobPath, flag, outPath] = process.argv.slice(2);
if (!jobPath || (flag && (flag !== "--out" || !outPath))) {
  console.error("Usage: node --experimental-strip-types scripts/build-montage-plan.mjs <job.json> [--out <new-file.json>]");
  process.exit(2);
}
let plan;
try {
  plan = buildMontagePlan(JSON.parse(readFileSync(jobPath, "utf8")));
} catch (error) {
  console.error(`Plan rejected: ${error.message}`);
  process.exit(1);
}
const text = JSON.stringify(plan, null, 2) + "\n";
if (!outPath) {
  process.stdout.write(text);
} else if (existsSync(outPath)) {
  console.error("Output exists; refusing to overwrite");
  process.exit(1);
} else {
  writeFileSync(outPath, text);
  console.error(`${DIRECTOR_VERSION}: ${plan.events.length} events → ${outPath}`);
}
