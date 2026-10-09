// Upload all three finished MP4s without re-encoding. Requires rclone configured externally.
// Usage: npm run upload:topic -- manychat
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const topic = process.argv[2];
if (!topic || !/^[a-z0-9_-]+$/.test(topic)) {
  console.error("Usage: npm run upload:topic -- manychat");
  process.exit(2);
}
const remote = process.env.ROMAN_DRIVE_REMOTE;
if (!remote || !/^[A-Za-z0-9_-]+:[^\r\n]*$/.test(remote)) {
  console.error("Set ROMAN_DRIVE_REMOTE, e.g. gdrive:Roman/finished-reels");
  process.exit(2);
}
const files = ["h1", "h2", "h3"].map(h => resolve("out", `R-${topic}-${h}.mp4`));
for (const file of files) {
  if (!existsSync(file) || statSync(file).size === 0) {
    console.error(`Missing or empty video: ${file}. Upload cancelled.`);
    process.exit(1);
  }
}
const bin = process.platform === "win32" ? "rclone.exe" : "rclone";
const check = spawnSync(bin, ["version"], { stdio: "ignore" });
if (check.error || check.status !== 0) {
  console.error("rclone is not installed or unavailable in PATH.");
  process.exit(1);
}
const destination = remote.replace(/\/$/, "") + "/" + topic;
for (const file of files) {
  const result = spawnSync(bin, ["copyto", file, destination + "/" + file.split(/[\\/]/).pop(), "--progress"], { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(`Upload failed: ${file}`);
    process.exit(result.status || 1);
  }
}
console.log(`Uploaded 3 original MP4s to ${destination}`);
