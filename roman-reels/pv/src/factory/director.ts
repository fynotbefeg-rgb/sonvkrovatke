// AI Montage Director v1.1 for Roman Factory Job 1.0.0.
// Pure, deterministic TypeScript: no React/Remotion/CLI imports, no model calls, no randomness.
// Erasable syntax only, so Codex can import it with `node --experimental-strip-types`.
// "AI" here means fixed editorial rules over real word timings, not language understanding.

export const SUPPORTED_SCHEMA_VERSION = "1.0.0";
export const DIRECTOR_VERSION = "director-v1.1";

export type Word = { text: string; start: number; end: number };
export type SafeZone = { top: number; right: number; bottom: number; left: number };
export type VisualAsset = { id: string; type: string; localPath: string; rightsReference: string };
export type EventType =
  | "caption" | "card" | "keyword" | "number" | "zoom"
  | "b_roll" | "split_screen" | "diagram" | "interface";
export type MontageEvent = {
  id: string;
  type: EventType;
  start: number;
  end: number;
  wordStart: number;
  wordEnd: number;
  assetId?: string;
  animation: "none" | "fade" | "slide" | "pop";
  position: "top" | "center" | "bottom" | "full_frame";
  layer: number;
  transition: "none" | "cut" | "fade";
  respectSafeZone: true;
};
export type MontagePlan = { events: MontageEvent[] };
export type SourceVideo = {
  localPath: string; sha256: string; duration: number; width: number; height: number; fps: number;
};
// Only the fields the Director and the composition read; the full contract is validated by Codex.
export type FactoryJob = {
  schemaVersion: string;
  reelId: string;
  sourceVideo: SourceVideo;
  wordTimings: Word[];
  visualAssets?: VisualAsset[];
  montagePlan?: MontagePlan;
  renderSettings?: { width: number; height: number; fps: number; safeZone: SafeZone };
};

export const DEFAULT_SAFE_ZONE: SafeZone = { top: 200, right: 120, bottom: 320, left: 100 };

// Explicit editorial limits (the "anti-overload" rules).
export const RULES = {
  captionMaxWords: 3, // content words; 1–2 letter prepositions/conjunctions are not counted
  captionMaxChars: 22, // letters + spaces of one page, before wrapping into ≤2 lines
  captionPauseBreak: 0.35, // s: a longer pause starts a new caption page
  captionHold: 0.6, // s: page stays after its last word unless the next page starts
  accentSecondsPerItem: 6, // at most floor(duration / 6) accents, minimum 1
  accentGap: 0, // s between the spoken words of two accents; a later accent cuts the earlier one's hold
  accentLead: 0.08, // s an accent appears before its first word
  listMinItems: 3,
  listMaxItemWords: 3,
  ctaTailShare: 0.3, // call to action is searched only in the last 30% of the clip
  zoomMinStart: 3, // s: no zoom on the opening hook seconds
  zoomScale: 1.05,
  layers: { zoom: 0, caption: 1, accent: 2 },
} as const;

const EPS = 1e-6;
const PREPOSITIONS = new Set([
  "в", "во", "с", "со", "на", "к", "ко", "по", "из", "для", "о", "об", "у", "от", "до", "за", "про",
]);
const FUNCTION_WORDS = new Set([...PREPOSITIONS, "и", "а", "но", "или", "не", "ни", "что", "как", "я", "ты"]);
const CONJUNCTIONS = new Set(["и", "или"]);
// Spoken tool names: typographic chip by default, explicit local image when supplied.
const TOOL_NAMES = new Set([
  "claude", "chatgpt", "gpt", "gemini", "telegram", "whatsapp", "manychat", "heygen", "instagram",
  "notion", "excel", "canva", "midjourney", "perplexity", "youtube", "tiktok",
]);
const NUMBER_RE = /^\d+(?:[.,]\d+)?%?$/;
const UNIT_RE = /^(?:секунд|сек|минут|мин|час|дн|день|недел|месяц|год|лет|раз|процент|%|₽|руб|тысяч|тыс|млн|миллион|клиент|заявк)/i;
const CTA_RE = /^(?:напиши|пиши|подпишись|сохрани|поставь|забери|жми|переходи|оставь|отправь)$/i;

/** Word text without surrounding punctuation (keeps inner hyphens, digits, %). */
export function bare(text: string): string {
  return text.replace(/^[«"'([{]+/u, "").replace(/[»"')\]},.;:!?…]+$/u, "");
}
/** Caption display text: drops trailing , . ; : but keeps ? and !. */
export function displayWord(text: string): string {
  return text.replace(/[,.;:…]+$/u, "");
}
const endsSentence = (text: string) => /[.!?…]["»)]*$/u.test(text);
const endsComma = (text: string) => /[,;:]["»)]*$/u.test(text);
const lower = (text: string) => bare(text).toLowerCase();

function fail(message: string): never {
  throw new Error(message);
}
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Safe repository-relative path under pv/public: same rules as Codex factory_media.public_source. */
export function isSafePublicPath(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) return false;
  if (value.startsWith("/") || value.includes("\\") || value.includes(":")) return false;
  if (/[\u0000-\u001f]/u.test(value)) return false;
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** Validates everything the Director relies on; throws with a static reason, never repairs data. */
export function assertJob(job: FactoryJob): void {
  if (!job || typeof job !== "object") fail("Job must be an object");
  if (job.schemaVersion !== SUPPORTED_SCHEMA_VERSION) fail(`Unsupported schemaVersion; expected ${SUPPORTED_SCHEMA_VERSION}`);
  if (typeof job.reelId !== "string" || !/^R-[a-z0-9][a-z0-9_-]*-h[123]$/.test(job.reelId)) fail("Invalid reelId");
  const source = job.sourceVideo;
  if (!source || typeof source !== "object") fail("Missing sourceVideo");
  if (!isSafePublicPath(source.localPath)) fail("Unsafe or empty sourceVideo.localPath");
  if (!isFiniteNumber(source.duration) || source.duration <= 0) fail("Invalid source duration");
  if (!isFiniteNumber(source.fps) || source.fps <= 0) fail("Invalid source fps");
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width < 1 || source.height < 1) {
    fail("Invalid source size");
  }
  const words = job.wordTimings;
  if (!Array.isArray(words) || words.length === 0) fail("No word timings: transcribe real audio first");
  let previousEnd = 0;
  words.forEach((word, index) => {
    if (!word || typeof word.text !== "string" || !/\S/u.test(word.text)) fail(`Word ${index}: empty text`);
    if (!isFiniteNumber(word.start) || !isFiniteNumber(word.end)) fail(`Word ${index}: non-numeric time`);
    if (word.start < 0 || word.end <= word.start) fail(`Word ${index}: invalid interval`);
    if (word.end > source.duration + EPS) fail(`Word ${index}: ends after source duration`);
    if (word.start < previousEnd - EPS) fail(`Word ${index}: overlaps previous word`);
    previousEnd = word.end;
  });
  const assets = job.visualAssets ?? [];
  if (!Array.isArray(assets)) fail("visualAssets must be an array");
  const ids = new Set<string>();
  for (const asset of assets) {
    if (!asset || typeof asset.id !== "string" || !/\S/u.test(asset.id)) fail("Asset without id");
    if (ids.has(asset.id)) fail(`Duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    if (!isSafePublicPath(asset.localPath)) fail(`Asset ${asset.id}: unsafe localPath`);
    if (typeof asset.rightsReference !== "string" || !/\S/u.test(asset.rightsReference)) fail(`Asset ${asset.id}: no rights reference`);
  }
  safeZoneOf(job);
}

export function safeZoneOf(job: FactoryJob): SafeZone {
  const zone = job.renderSettings?.safeZone ?? DEFAULT_SAFE_ZONE;
  const values = [zone.top, zone.right, zone.bottom, zone.left];
  if (!values.every((v) => Number.isInteger(v) && v >= 0)) fail("Invalid safeZone");
  if (zone.left + zone.right >= 1080 - 200 || zone.top + zone.bottom >= 1920 - 600) fail("safeZone leaves no room");
  return zone;
}

// ---------- captions ----------

export type CaptionPage = { wordStart: number; wordEnd: number };

const pageChars = (words: Word[], from: number, to: number) => {
  let total = 0;
  for (let i = from; i <= to; i++) total += displayWord(words[i].text).length + (i > from ? 1 : 0);
  return total;
};

/** Groups words into short caption pages; never splits or edits a word. */
export function captionPages(words: Word[]): CaptionPage[] {
  const pages: CaptionPage[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start >= 0 && end >= start) pages.push({ wordStart: start, wordEnd: end });
    start = -1;
  };
  const isShort = (i: number) => bare(words[i].text).length <= 2 && !NUMBER_RE.test(bare(words[i].text));
  for (let i = 0; i < words.length; i++) {
    if (start >= 0) {
      let count = 0;
      for (let k = start; k <= i; k++) if (!isShort(k)) count++;
      const pause = words[i].start - words[i - 1].end;
      const tooLong = count > RULES.captionMaxWords || pageChars(words, start, i) > RULES.captionMaxChars;
      if (pause > RULES.captionPauseBreak) {
        flush(i - 1);
      } else if (tooLong) {
        // Do not leave dangling prepositions/conjunctions at the end of a page.
        let last = i - 1;
        while (last > start && FUNCTION_WORDS.has(lower(words[last].text)) && !endsComma(words[last].text)) last--;
        const carry = last + 1;
        flush(last);
        if (carry < i) start = carry;
      }
    }
    if (start < 0) start = i;
    const text = words[i].text;
    if (endsSentence(text) || (endsComma(text) && i - start + 1 >= 2)) flush(i);
  }
  flush(words.length - 1);
  return pages;
}

/** Index of the highlighted word at time t: the last word already started inside the page. */
export function activeWordIndex(words: Word[], page: CaptionPage, t: number): number {
  let active = page.wordStart;
  for (let i = page.wordStart; i <= page.wordEnd; i++) if (words[i].start <= t + EPS) active = i;
  return active;
}

/** Frame → time convention shared by tests and the composition. */
export const frameTime = (frame: number, fps: number) => frame / fps;

// ---------- semantic accents ----------

type Candidate = { type: EventType; wordStart: number; wordEnd: number; hold: number; priority: number; assetId?: string };

function sentences(words: Word[]): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  let start = 0;
  words.forEach((word, i) => {
    if (endsSentence(word.text) || i === words.length - 1) {
      result.push([start, i]);
      start = i + 1;
    }
  });
  return result;
}

/** Number + optional unit spoken as digits ("10 секунд"). Spelled-out numbers are not detected. */
function numberCandidates(words: Word[]): Candidate[] {
  const found: Candidate[] = [];
  words.forEach((word, i) => {
    if (!NUMBER_RE.test(bare(word.text))) return;
    const next = words[i + 1];
    const withUnit = !endsSentence(word.text) && !endsComma(word.text) && next && UNIT_RE.test(lower(next.text));
    found.push({ type: "number", wordStart: i, wordEnd: withUnit ? i + 1 : i, hold: 1.2, priority: 1 });
  });
  return found;
}

/** Splits a span into list items at commas and standalone "и"/"или"; returns [from, to] ranges. */
export function listItemRanges(words: Word[], from: number, to: number): Array<[number, number]> {
  const items: Array<[number, number]> = [];
  let start = from;
  for (let i = from; i <= to; i++) {
    if (CONJUNCTIONS.has(lower(words[i].text)) && i > start) {
      items.push([start, i - 1]);
      start = i + 1;
    } else if (endsComma(words[i].text) || i === to) {
      if (i >= start) items.push([start, i]);
      start = i + 1;
    }
  }
  return items;
}

/** Display label of one list item: drops a leading preposition of multi-word items. */
export function listItemLabel(words: Word[], [from, to]: [number, number]): string {
  let first = from;
  if (to > from && PREPOSITIONS.has(lower(words[from].text))) first++;
  const parts: string[] = [];
  for (let i = first; i <= to; i++) parts.push(bare(words[i].text));
  return parts.join(" ");
}

/**
 * Enumeration inside one sentence: ≥2 commas, ≥3 short items.
 * First item = tail of the first clause from its last preposition; last clause is cut at "и".
 */
function listCandidates(words: Word[]): Candidate[] {
  const found: Candidate[] = [];
  for (const [s, e] of sentences(words)) {
    const commas: number[] = [];
    for (let i = s; i < e; i++) if (endsComma(words[i].text)) commas.push(i);
    if (commas.length < 2) continue;
    // first item: tail of the first clause
    const firstEnd = commas[0];
    let first = firstEnd;
    for (let i = firstEnd - 1; i >= Math.max(s, firstEnd - (RULES.listMaxItemWords - 1)); i--) {
      if (PREPOSITIONS.has(lower(words[i].text))) {
        first = i;
        break;
      }
    }
    // last item(s): clause after the last comma, up to the end of the enumeration
    const tailStart = commas[commas.length - 1] + 1;
    let last = commas[commas.length - 1];
    if (tailStart <= e) {
      let conj = -1;
      for (let i = tailStart; i <= e; i++) if (CONJUNCTIONS.has(lower(words[i].text))) { conj = i; break; }
      if (conj < 0) {
        if (e - tailStart + 1 <= RULES.listMaxItemWords) last = e;
      } else if (conj - tailStart <= RULES.listMaxItemWords && conj > tailStart) {
        last = conj - 1;
        if (e - conj <= RULES.listMaxItemWords && e > conj) last = e;
      }
    }
    const items = listItemRanges(words, first, last);
    // Item length is counted without its leading preposition ("в чат на сайте" → 3 words).
    const short = items.every(([a, b]) =>
      b - a + 1 - (b > a && PREPOSITIONS.has(lower(words[a].text)) ? 1 : 0) <= RULES.listMaxItemWords);
    if (items.length >= RULES.listMinItems && short) {
      found.push({ type: "diagram", wordStart: first, wordEnd: last, hold: 0.8, priority: 2 });
    }
  }
  return found;
}

/** Call to action near the end: imperative opening a sentence, card covers its first clause (≤4 words). */
function ctaCandidates(words: Word[], duration: number): Candidate[] {
  const found: Candidate[] = [];
  for (const [s, e] of sentences(words)) {
    if (words[s].start < duration * (1 - RULES.ctaTailShare) || !CTA_RE.test(lower(words[s].text))) continue;
    let end = s;
    while (end < e && end - s < 3 && !endsComma(words[end].text)) end++;
    found.push({ type: "card", wordStart: s, wordEnd: end, hold: 1.4, priority: 3 });
  }
  return found;
}

function toolCandidates(words: Word[], assets: VisualAsset[]): Candidate[] {
  const found: Candidate[] = [];
  words.forEach((word, i) => {
    const name = lower(word.text);
    if (!TOOL_NAMES.has(name)) return;
    // Explicit opt-in asset convention; no download, invented screenshot or fuzzy match.
    const asset = assets.find((a) => a.id === `tool-${name}`);
    if (asset) {
      assertInterfaceAsset(asset);
      found.push({ type: "interface", wordStart: i, wordEnd: i, hold: 2.8, priority: 4, assetId: asset.id });
    } else {
      found.push({ type: "keyword", wordStart: i, wordEnd: i, hold: 1.0, priority: 4 });
    }
  });
  return found;
}

function assertInterfaceAsset(asset: VisualAsset): void {
  if (asset.type !== "image" || !/\.(?:png|jpe?g|webp|svg)$/i.test(asset.localPath)) {
    fail(`Asset ${asset.id}: interface requires a local image`);
  }
}

/** Text shown by a number/keyword/card event: the spoken words themselves, never new copy. */
export function eventLabel(words: Word[], event: Pick<MontageEvent, "wordStart" | "wordEnd">): string {
  const parts: string[] = [];
  for (let i = event.wordStart; i <= event.wordEnd; i++) parts.push(bare(words[i].text));
  const label = parts.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function windowOf(words: Word[], candidate: Candidate, duration: number) {
  // Exact source times (no rounding): rounding could uncover the anchored words.
  const start = Math.max(0, words[candidate.wordStart].start - RULES.accentLead);
  const end = Math.min(duration, words[candidate.wordEnd].end + candidate.hold);
  return { start, end };
}

// ---------- plan ----------

export function buildMontagePlan(job: FactoryJob): MontagePlan {
  assertJob(job);
  const words = job.wordTimings;
  const duration = job.sourceVideo.duration;
  const events: MontageEvent[] = [];

  const pages = captionPages(words);
  pages.forEach((page, index) => {
    const next = pages[index + 1];
    const hold = words[page.wordEnd].end + RULES.captionHold;
    const end = Math.min(duration, next ? Math.min(hold, words[next.wordStart].start) : hold);
    events.push({
      id: `caption-${String(index + 1).padStart(3, "0")}`, type: "caption",
      start: words[page.wordStart].start, end: Math.max(end, words[page.wordEnd].end),
      wordStart: page.wordStart, wordEnd: page.wordEnd, animation: "pop", position: "bottom",
      layer: RULES.layers.caption, transition: "none", respectSafeZone: true,
    });
  });

  // Accents: priority first, then time; greedy acceptance without overlaps in the top band.
  const candidates = [
    ...numberCandidates(words), ...listCandidates(words), ...ctaCandidates(words, duration), ...toolCandidates(words, job.visualAssets ?? []),
  ].sort((a, b) => a.priority - b.priority || a.wordStart - b.wordStart);
  const budget = Math.max(1, Math.floor(duration / RULES.accentSecondsPerItem));
  const accepted: Array<Candidate & { start: number; end: number }> = [];
  for (const candidate of candidates) {
    if (accepted.length >= budget) break;
    // Accents clash only if their spoken words overlap; holds are trimmed below.
    const spokenStart = words[candidate.wordStart].start;
    const spokenEnd = words[candidate.wordEnd].end;
    const clash = accepted.some((other) =>
      spokenStart < words[other.wordEnd].end + RULES.accentGap &&
      words[other.wordStart].start < spokenEnd + RULES.accentGap);
    if (!clash) accepted.push({ ...candidate, ...windowOf(words, candidate, duration) });
  }
  accepted.sort((a, b) => a.start - b.start);
  // The next accent replaces the previous one: trim the hold, never the anchored words.
  for (let i = 1; i < accepted.length; i++) {
    const previous = accepted[i - 1];
    const current = accepted[i];
    if (previous.end > current.start) {
      previous.end = Math.max(words[previous.wordEnd].end, current.start);
      current.start = Math.max(current.start, previous.end);
    }
  }
  const counters: Record<string, number> = {};
  for (const accent of accepted) {
    counters[accent.type] = (counters[accent.type] ?? 0) + 1;
    events.push({
      id: `${accent.type}-${String(counters[accent.type]).padStart(2, "0")}`, type: accent.type,
      start: accent.start, end: accent.end, wordStart: accent.wordStart, wordEnd: accent.wordEnd,
      animation: accent.type === "diagram" ? "slide" : "pop", position: "top",
      layer: RULES.layers.accent, transition: "fade", respectSafeZone: true,
      ...(accent.assetId ? { assetId: accent.assetId } : {}),
    });
  }

  // One gentle zoom, only on a spoken number after the opening seconds.
  const zoomOn = accepted.find((a) => a.type === "number" && words[a.wordStart].start >= RULES.zoomMinStart);
  if (zoomOn) {
    events.push({
      id: "zoom-01", type: "zoom", start: zoomOn.start, end: zoomOn.end,
      wordStart: zoomOn.wordStart, wordEnd: zoomOn.wordEnd, animation: "fade", position: "full_frame",
      layer: RULES.layers.zoom, transition: "fade", respectSafeZone: true,
    });
  }

  events.sort((a, b) => a.start - b.start || a.layer - b.layer || (a.id < b.id ? -1 : 1));
  const plan = { events };
  validateMontagePlan(job, plan);
  return plan;
}

const EVENT_TYPES = new Set<string>(["caption", "card", "keyword", "number", "zoom", "b_roll", "split_screen", "diagram", "interface"]);
const RENDERED_TYPES = new Set<string>(["caption", "card", "keyword", "number", "zoom", "diagram", "interface"]);

/** Checks a plan against the job: word anchors, duration, assets, overlaps. Used before rendering too. */
export function validateMontagePlan(job: FactoryJob, plan: MontagePlan): void {
  assertJob(job);
  if (!plan || !Array.isArray(plan.events)) fail("montagePlan.events must be an array");
  const words = job.wordTimings;
  const duration = job.sourceVideo.duration;
  const assetIds = new Set((job.visualAssets ?? []).map((asset) => asset.id));
  const ids = new Set<string>();
  const byLayerType: Record<string, MontageEvent[]> = {};
  for (const event of plan.events) {
    const where = `Event ${event?.id ?? "?"}`;
    if (typeof event.id !== "string" || !/\S/u.test(event.id) || ids.has(event.id)) fail(`${where}: missing or duplicate id`);
    ids.add(event.id);
    if (!EVENT_TYPES.has(event.type)) fail(`${where}: unknown type`);
    if ((event.type === "b_roll" || event.type === "interface") && !event.assetId) fail(`${where}: assetId required`);
    if (event.assetId !== undefined && !assetIds.has(event.assetId)) fail(`${where}: unknown assetId`);
    if (event.type === "interface") {
      assertInterfaceAsset(job.visualAssets!.find((a) => a.id === event.assetId)!);
      if (event.position !== "top") fail(`${where}: interface must stay in the top safe band`);
    }
    if (!RENDERED_TYPES.has(event.type)) fail(`${where}: type ${event.type} is not supported by RomanFactoryV1 yet`);
    if (event.respectSafeZone !== true) fail(`${where}: must respect safe zone`);
    if (!isFiniteNumber(event.start) || !isFiniteNumber(event.end) || event.start < 0 || event.end <= event.start) {
      fail(`${where}: invalid interval`);
    }
    if (event.end > duration + EPS) fail(`${where}: ends after source duration`);
    const { wordStart, wordEnd } = event;
    if (!Number.isInteger(wordStart) || !Number.isInteger(wordEnd) || wordStart < 0 || wordEnd < wordStart || wordEnd >= words.length) {
      fail(`${where}: word indexes out of range`);
    }
    if (event.start > words[wordStart].start + EPS || event.end < words[wordEnd].end - EPS) fail(`${where}: does not cover its words`);
    if (!Number.isInteger(event.layer) || event.layer < 0) fail(`${where}: invalid layer`);
    const key = event.type === "caption" ? "caption" : event.type === "zoom" ? "zoom" : `accent-${event.position}`;
    (byLayerType[key] ??= []).push(event);
  }
  for (const [key, list] of Object.entries(byLayerType)) {
    const sorted = [...list].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].start < sorted[i - 1].end - EPS) fail(`Events ${sorted[i - 1].id} and ${sorted[i].id} overlap (${key})`);
    }
  }
}
