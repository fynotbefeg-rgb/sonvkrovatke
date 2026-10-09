// High-quality Roman Reels render. Run from roman-reels/pv via npm run render:quality -- <composition>.
// Keeps the composition's native FPS (currently 25) and does not impose a file-size cap.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const composition = process.argv[2];
if (!composition || !/^R-[a-z0-9_-]+-h[123]$/.test(composition)) {
  console.error("Usage: npm run render:quality -- R-manychat-h1");
  process.exit(2);
}

mkdirSync("out", { recursive: true });
const output = join("out", `${composition}.mp4`);
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const args = [
  "remotion", "render", composition, output,
  "--codec=h264",
  "--crf=18",
  "--audio-codec=aac",
  "--audio-bitrate=192k",
  "--concurrency=4",
];
console.log(`Rendering ${composition} to ${output} (high quality; no 30 MB limit)`);
const result = spawnSync(executable, args, { stdio: "inherit", shell: process.platform === "win32" });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
