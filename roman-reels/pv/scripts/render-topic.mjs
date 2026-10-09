// Render three hook variants sequentially using the quality renderer.
// Usage (from roman-reels/pv): npm run render:topic -- manychat
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const topic = process.argv[2];
if (!topic || !/^[a-z0-9_-]+$/.test(topic)) {
  console.error("Usage: npm run render:topic -- manychat");
  process.exit(2);
}

// Validate against the existing TOPICS keys without evaluating TSX.
const source = readFileSync(new URL("../src/RomanReel.tsx", import.meta.url), "utf8");
const topicBlock = source.match(/export const TOPICS:[^=]*=\s*\{([\s\S]*?)\n\};/);
const available = topicBlock ? [...topicBlock[1].matchAll(/^  ([a-z][a-z0-9_-]*): \{/gm)].map(m => m[1]) : [];
if (!available.includes(topic)) {
  console.error(`Unknown topic "${topic}". Available: ${available.join(", ") || "(none found)"}`);
  process.exit(2);
}
const executable = process.execPath;
const renderer = new URL("./render-quality.mjs", import.meta.url);
for (const hook of ["h1", "h2", "h3"]) {
  const composition = `R-${topic}-${hook}`;
  console.log(`\n=== ${composition} ===\n`);
  const result = spawnSync(executable, [renderer.pathname, composition], { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(`Render failed for ${composition}; stopping batch.`);
    process.exit(result.status || 1);
  }
}
console.log(`\nDone: out/R-${topic}-h1.mp4, h2.mp4, h3.mp4`);
