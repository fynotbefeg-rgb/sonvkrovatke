// Загружает рендеры в папку на Google Диске (GDRIVE_FOLDER_ID), повторяя структуру renders/.
//   node scripts/upload-drive.mjs                    — всё из renders/
//   node scripts/upload-drive.mjs renders/week1 x.mp4 — только указанные файлы и папки
// Файл, который уже лежит на Диске с тем же MD5, пропускается; изменённый — заменяется новой версией.
//
// Токен берётся запросом grant_type=refresh_token. В облачной сессии Claude Code прокси сам
// подставляет client_id, client_secret и refresh_token; в другом месте задайте их в переменных
// GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN.
// Встроенный fetch Node ходит через HTTPS_PROXY только с NODE_USE_ENV_PROXY=1 (так запускает npm run upload).
import { createHash } from "node:crypto";
import { createReadStream, readdirSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

const ROOT_FOLDER = process.env.GDRIVE_FOLDER_ID;
const RENDERS = "renders";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const CHUNK = 8 * 1024 * 1024; // кратно 256 КиБ, как требует Drive
const FOLDER_MIME = "application/vnd.google-apps.folder";
const MIME = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
};

let token = null;
let tokenExpires = 0;

async function accessToken() {
  if (token && Date.now() < tokenExpires - 5 * 60 * 1000) return token;
  const body = new URLSearchParams({ grant_type: "refresh_token" });
  for (const [key, env] of [
    ["client_id", "GDRIVE_CLIENT_ID"],
    ["client_secret", "GDRIVE_CLIENT_SECRET"],
    ["refresh_token", "GDRIVE_REFRESH_TOKEN"],
  ]) {
    if (process.env[env]) body.set(key, process.env[env]);
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      `Токен не получен (${res.status}): ${data.error_description || data.error}`,
    );
  token = data.access_token;
  tokenExpires = Date.now() + data.expires_in * 1000;
  return token;
}

async function api(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      ...init.headers,
    },
  });
  if (!res.ok)
    throw new Error(
      `${init.method || "GET"} ${url.split("?")[0]} → ${res.status}: ${await res.text()}`,
    );
  return res;
}

const q = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

async function findChild(parent, name, folder) {
  const query = `name = ${q(name)} and ${q(parent)} in parents and trashed = false and mimeType ${folder ? "=" : "!="} '${FOLDER_MIME}'`;
  const res = await api(
    `${API}/files?${new URLSearchParams({ q: query, fields: "files(id,md5Checksum)" })}`,
  );
  return (await res.json()).files[0];
}

const folderCache = new Map();
async function folderFor(relDir) {
  if (relDir === "." || relDir === "") return ROOT_FOLDER;
  if (folderCache.has(relDir)) return folderCache.get(relDir);
  const parent = await folderFor(dirname(relDir));
  const name = basename(relDir);
  let folder = await findChild(parent, name, true);
  if (!folder) {
    const res = await api(`${API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
    });
    folder = await res.json();
  }
  folderCache.set(relDir, folder.id);
  return folder.id;
}

function md5(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("md5");
    createReadStream(path)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

// Возобновляемая загрузка: файл уходит частями, после обрыва продолжается с подтверждённого байта.
async function resumableUpload(path, size, mimeType, existingId, metadata) {
  const url = existingId
    ? `${UPLOAD}/files/${existingId}?uploadType=resumable&fields=id,md5Checksum,webViewLink`
    : `${UPLOAD}/files?uploadType=resumable&fields=id,md5Checksum,webViewLink`;
  const start = await api(url, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType,
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify(existingId ? {} : metadata),
  });
  const session = start.headers.get("location");
  const fh = await open(path, "r");
  try {
    let offset = 0;
    let failures = 0;
    for (;;) {
      const end = Math.min(offset + CHUNK, size);
      const buf = Buffer.alloc(end - offset);
      await fh.read(buf, 0, buf.length, offset);
      let res;
      try {
        res = await fetch(session, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            "Content-Range": size
              ? `bytes ${offset}-${end - 1}/${size}`
              : "bytes */0",
          },
          body: buf,
        });
      } catch (err) {
        if (++failures > 4) throw err;
        await new Promise((r) => setTimeout(r, 2 ** failures * 1000));
        res = await fetch(session, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${await accessToken()}`,
            "Content-Range": `bytes */${size}`,
          },
        });
      }
      if (res.status === 200 || res.status === 201) return res.json();
      if (res.status === 308) {
        const range = res.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : 0;
        process.stdout.write(`\r  ${Math.round((offset / size) * 100)}%`);
        continue;
      }
      if (res.status >= 500 && ++failures <= 4) {
        await new Promise((r) => setTimeout(r, 2 ** failures * 1000));
        continue;
      }
      throw new Error(`Загрузка ${path} → ${res.status}: ${await res.text()}`);
    }
  } finally {
    await fh.close();
  }
}

function collect(path) {
  if (statSync(path).isDirectory())
    return readdirSync(path).flatMap((name) => collect(join(path, name)));
  return basename(path).startsWith(".") ? [] : [path];
}

export async function uploadFile(path) {
  const rel = relative(RENDERS, path);
  const relDir = rel.startsWith("..") ? "." : dirname(rel);
  const name = basename(path);
  const label =
    relDir === "." ? name : `${relDir.split(sep).join("/")}/${name}`;
  const [hash, parent] = await Promise.all([
    md5(path),
    folderFor(relDir.split(sep).join("/")),
  ]);
  const existing = await findChild(parent, name, false);
  if (existing?.md5Checksum === hash) {
    console.log(`= ${label} — уже на Диске`);
    return;
  }
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  const { size } = statSync(path);
  const file = await resumableUpload(
    path,
    size,
    MIME[ext] || "application/octet-stream",
    existing?.id,
    { name, parents: [parent] },
  );
  if (file.md5Checksum !== hash)
    throw new Error(
      `${label}: MD5 на Диске (${file.md5Checksum}) не совпал с локальным (${hash})`,
    );
  console.log(
    `\r${existing ? "↻" : "↑"} ${label} — ${(size / 1024 / 1024).toFixed(1)} МБ, MD5 совпал, ${file.webViewLink}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!ROOT_FOLDER) {
    console.error(
      "Задайте GDRIVE_FOLDER_ID — ID папки на Диске, куда грузить.",
    );
    process.exit(1);
  }
  const targets = process.argv.slice(2);
  const files = (targets.length ? targets : [RENDERS]).flatMap(collect);
  let failed = 0;
  for (const file of files) {
    try {
      await uploadFile(file);
    } catch (err) {
      failed++;
      console.error(`✗ ${file}: ${err.message}`);
    }
  }
  console.log(`Готово: ${files.length - failed} из ${files.length}.`);
  process.exit(failed ? 1 : 0);
}
