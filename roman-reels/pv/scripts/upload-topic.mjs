// Upload all three finished MP4s without re-encoding. Requires rclone configured externally.
// Usage: npm run upload:topic -- manychat [--dry-run]
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const topic = process.argv[2];
const dryRun = process.argv.slice(3).includes("--dry-run");
if (!topic || !/^[a-z0-9_-]+$/.test(topic)) {
  console.error("Usage: npm run upload:topic -- manychat");
  process.exit(2);
}
const remote = process.env.ROMAN_DRIVE_REMOTE;
if (!remote || !/^[A-Za-z0-9_-]+:[^\r\n]*$/.test(remote)) {
  console.error("Set ROMAN_DRIVE_REMOTE, e.g. gdrive:Roman/finished-reels");
  process.exit(2);
}
// out/ next to package.json, independent of the current working directory
const outDir = fileURLToPath(new URL("../out/", import.meta.url));
const files = ["h1", "h2", "h3"].map(h => resolve(outDir, `R-${topic}-${h}.mp4`));
const missing = files.filter(file => !existsSync(file) || statSync(file).size === 0);
if (missing.length) {
  console.error(`Missing or empty video(s):\n  ${missing.join("\n  ")}\nUpload cancelled; nothing was sent.`);
  process.exit(1);
}
const bin = process.platform === "win32" ? "rclone.exe" : "rclone";
const check = spawnSync(bin, ["version"], { stdio: "ignore" });
if (check.error || check.status !== 0) {
  console.error("rclone is not installed or unavailable in PATH.");
  process.exit(1);
}
const destination = remote.replace(/\/$/, "") + "/" + topic;
for (const file of files) {
  const args = ["copyto", file, destination + "/" + file.split(/[\\/]/).pop(), "--progress"];
  if (dryRun) args.push("--dry-run");
  const result = spawnSync(bin, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(`Upload failed: ${file}`);
    process.exit(result.status || 1);
  }
}
console.log(dryRun ? `Dry run OK: 3 MP4s would be uploaded to ${destination}` : `Uploaded 3 original MP4s to ${destination}`);
