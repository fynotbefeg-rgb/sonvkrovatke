// Рендерит все рилсы из src/reels.ts в renders/weekN/dayNN.mp4.
// Аргументы передаются в remotion render, например --browser-executable=...
// С --upload каждый готовый ролик сразу уходит на Google Диск (scripts/upload-drive.mjs).
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";

const ids = [...readFileSync("src/reels.ts", "utf8").matchAll(/^  (Day\d\d): \[/gm)].map((m) => m[1]);
const only = process.argv.slice(2).filter((a) => /^Day\d\d$/.test(a));
const upload = process.argv.includes("--upload");
const extra = process.argv.slice(2).filter((a) => !/^Day\d\d$/.test(a) && a !== "--upload");

for (const id of only.length ? only : ids) {
  const day = Number(id.slice(3));
  const dir = `renders/week${Math.ceil(day / 7)}`;
  mkdirSync(dir, { recursive: true });
  const out = `${dir}/day${id.slice(3)}.mp4`;
  console.log(`→ ${id}: ${out}`);
  execFileSync("npx", ["remotion", "render", id, out, "--codec=h264", "--crf=22", ...extra], { stdio: "inherit" });
  if (upload) {
    execFileSync("node", ["scripts/upload-drive.mjs", out], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  }
}
