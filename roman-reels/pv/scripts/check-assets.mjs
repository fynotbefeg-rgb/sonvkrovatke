// Check that every source file needed by one composition exists in public/ and is not empty.
// Reads src/RomanReel.tsx as text (does not evaluate or change the template).
// Usage (from roman-reels/pv): node scripts/check-assets.mjs R-manychat-h1 [--list]
//   --list  print required paths (relative to public/), one per line, and exit 0
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const composition = process.argv[2];
const listOnly = process.argv.slice(3).includes("--list");
const m = composition && composition.match(/^R-([a-z0-9_]+)-(h[123])(-ph)?$/);
if (!m) {
  console.error("Usage: node scripts/check-assets.mjs R-manychat-h1 [--list]");
  process.exit(2);
}
const [, topic, hook] = m;

const source = readFileSync(new URL("../src/RomanReel.tsx", import.meta.url), "utf8");
const start = source.indexOf(`\n  ${topic}: {\n`);
if (start < 0) {
  console.error(`Topic "${topic}" not found in TOPICS (src/RomanReel.tsx).`);
  process.exit(2);
}
const end = source.indexOf("\n  },\n", start);
const block = source.slice(start, end < 0 ? undefined : end);

const dir = block.match(/dir: "([^"]+)"/)?.[1];
if (!dir) {
  console.error(`Topic "${topic}" has no dir in TOPICS.`);
  process.exit(2);
}
const required = new Set([`${dir}/${hook}.mp4`, `${dir}/osnova.mp4`]);
for (const [, src] of block.matchAll(/kind: "phone"[^\n]*?src: "([^"]+)"/g)) required.add(`ai/${src}`);
for (const [, img] of block.matchAll(/kind: "web"[^\n]*?img: "([^"]+)"/g)) required.add(img);
// logos used by captions (Claude / ChatGPT words)
required.add("ai/claude-w.svg");
required.add("ai/openai-w.svg");

if (listOnly) {
  for (const p of required) console.log(p);
  process.exit(0);
}

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const missing = [];
for (const p of required) {
  const f = publicDir + p;
  const ok = existsSync(f) && statSync(f).isFile() && statSync(f).size > 0;
  console.log(`${ok ? "ok     " : "MISSING"} public/${p}${ok ? `  (${statSync(f).size} bytes)` : ""}`);
  if (!ok) missing.push(p);
}
if (missing.length) {
  console.error(`\n${missing.length} source file(s) missing or empty for ${composition}. Render cancelled.`);
  process.exit(1);
}
console.log(`\nAll ${required.size} source files for ${composition} are present.`);
