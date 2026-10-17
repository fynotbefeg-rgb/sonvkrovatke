// Run: node --experimental-strip-types --test src/factory/director.test.ts   (from roman-reels/pv)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  activeWordIndex, assertJob, buildMontagePlan, captionPages, eventLabel, frameTime, isSafePublicPath,
  listItemLabel, listItemRanges, RULES, validateMontagePlan,
} from "./director.ts";
import type { FactoryJob, MontageEvent, Word } from "./director.ts";
import { captionFontSize, CHAR_EM, wrapLines } from "./layout.ts";

const FIXTURES = ["h1", "h2", "h3"].map((h) => {
  const url = new URL(`../../../research/first-montage-v1/assembled-jobs/R-ai-shared-body-fixture-${h}-job.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as FactoryJob;
});

const job = (words: Word[], extra: Partial<FactoryJob> = {}): FactoryJob => ({
  schemaVersion: "1.0.0",
  reelId: "R-test-h1",
  sourceVideo: { localPath: "rr/test.mp4", sha256: "0".repeat(64), duration: 10, width: 1080, height: 1920, fps: 25 },
  wordTimings: words,
  ...extra,
});
const w = (text: string, start: number, end: number): Word => ({ text, start, end });
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

test("rejects unknown schemaVersion", () => {
  assert.throws(() => buildMontagePlan({ ...job([w("Да", 0, 1)]), schemaVersion: "2.0.0" }), /schemaVersion/);
});

test("rejects empty word timings instead of inventing words", () => {
  assert.throws(() => buildMontagePlan(job([])), /No word timings/);
});

test("rejects unsafe source and asset paths", () => {
  for (const bad of ["/etc/passwd", "../x.mp4", "rr/../../x.mp4", "C:\\x.mp4", "rr\\x.mp4", "a//b.mp4", "", " rr/x.mp4"]) {
    assert.equal(isSafePublicPath(bad), false, bad);
    const j = job([w("Да", 0, 1)]);
    j.sourceVideo.localPath = bad;
    assert.throws(() => assertJob(j), /localPath/, bad);
  }
  assert.equal(isSafePublicPath("rr/incoming/shared-body-test/R-x-h1.mp4"), true);
  const withAsset = job([w("Да", 0, 1)], { visualAssets: [{ id: "a", type: "image", localPath: "../a.png", rightsReference: "own" }] });
  assert.throws(() => assertJob(withAsset), /unsafe localPath/);
});

test("rejects invalid word intervals", () => {
  const cases: Word[][] = [
    [w("а", 1, 1)], // zero length
    [w("а", 2, 1)], // reversed
    [w("а", 0, 1), w("б", 0.5, 2)], // overlap
    [w("а", 0, 11)], // beyond duration 10 s
    [w("а", Number.NaN, 1)],
    [w(" ", 0, 1)],
  ];
  for (const words of cases) assert.throws(() => buildMontagePlan(job(words)), JSON.stringify(words));
});

test("plan is deterministic for the same job", () => {
  for (const fixture of FIXTURES) {
    assert.deepEqual(buildMontagePlan(clone(fixture)), buildMontagePlan(clone(fixture)));
    assert.equal(JSON.stringify(buildMontagePlan(fixture)), JSON.stringify(buildMontagePlan(clone(fixture))));
  }
});

test("real assembled jobs: every event anchored to real words and inside duration", () => {
  for (const fixture of FIXTURES) {
    const plan = buildMontagePlan(fixture);
    const words = fixture.wordTimings;
    const duration = fixture.sourceVideo.duration;
    validateMontagePlan(fixture, plan);
    for (const e of plan.events) {
      assert.ok(e.start >= 0 && e.end <= duration && e.start < e.end, e.id);
      assert.ok(e.start <= words[e.wordStart].start && e.end >= words[e.wordEnd].end, e.id);
      assert.equal(e.assetId, undefined, "no assets were supplied, so none may be referenced");
      assert.equal(e.respectSafeZone, true);
    }
    // captions cover every spoken word exactly once and in order
    const captions = plan.events.filter((e) => e.type === "caption");
    let next = 0;
    for (const c of captions) {
      assert.equal(c.wordStart, next);
      next = c.wordEnd + 1;
    }
    assert.equal(next, words.length);
    const accents = plan.events.filter((e) => e.type !== "caption" && e.type !== "zoom");
    assert.ok(accents.length >= 1, "at least one meaningful accent");
    assert.ok(accents.length <= Math.max(1, Math.floor(duration / RULES.accentSecondsPerItem)));
    assert.ok(accents.every((e) => e.position === "top"), "accents stay out of the face/caption bands");
    const zooms = plan.events.filter((e) => e.type === "zoom");
    assert.ok(zooms.length <= 1);
    for (const z of zooms) assert.ok(words[z.wordStart].start >= RULES.zoomMinStart);
  }
});

test("real assembled jobs: semantic accents use only spoken words", () => {
  const plan = buildMontagePlan(FIXTURES[0]);
  const words = FIXTURES[0].wordTimings;
  const labels = plan.events.filter((e) => e.type !== "caption" && e.type !== "zoom").map((e) =>
    e.type === "diagram" ? listItemRanges(words, e.wordStart, e.wordEnd).map((r) => listItemLabel(words, r)).join(" / ") : eventLabel(words, e));
  assert.deepEqual(labels, [
    "почту / Telegram / WhatsApp / чат на сайте / комментарии",
    "Claude",
    "10 секунд",
    "отзывами / заявками с сайта / коммерческими предложениями / договорами",
    "Напиши в комментариях",
  ]);
  const spoken = new Set(words.map((x) => x.text.replace(/[,.;:!?]+$/u, "").toLowerCase()));
  for (const label of labels) {
    for (const token of label.split(/[ /]+/u).filter(Boolean)) assert.ok(spoken.has(token.toLowerCase()), token);
  }
});

test("shared body keeps the same accents in every hook variant", () => {
  const bodyLabels = FIXTURES.map((fixture) => {
    const words = fixture.wordTimings;
    return buildMontagePlan(fixture).events
      .filter((e) => e.type === "number" || e.type === "card" || e.type === "keyword")
      .map((e) => eventLabel(words, e));
  });
  assert.deepEqual(bodyLabels[0], bodyLabels[1]);
  assert.deepEqual(bodyLabels[0], bodyLabels[2]);
});

test("active word matches the frame on word boundaries", () => {
  const fixture = FIXTURES[0];
  const words = fixture.wordTimings;
  const fps = fixture.sourceVideo.fps;
  const plan = buildMontagePlan(fixture);
  const captions = plan.events.filter((e) => e.type === "caption");
  const total = Math.ceil(fixture.sourceVideo.duration * fps);
  for (let frame = 0; frame < total; frame++) {
    const t = frameTime(frame, fps);
    const page = captions.find((c) => c.start <= t && t < c.end);
    if (!page) continue;
    const i = activeWordIndex(words, page, t);
    assert.ok(i >= page.wordStart && i <= page.wordEnd);
    if (words[i].start > t + 1e-6) assert.equal(i, page.wordStart, "only the first word may be shown before it starts");
    if (i < page.wordEnd) assert.ok(words[i + 1].start > t + 1e-6, `frame ${frame}: next word already started`);
  }
  // exact boundary: the frame that starts on a word highlights that word, the frame before does not
  const page = { wordStart: 0, wordEnd: 1 };
  const pair = [w("один", 0, 0.4), w("два", 0.4, 1)];
  assert.equal(activeWordIndex(pair, page, frameTime(10, 25)), 1);
  assert.equal(activeWordIndex(pair, page, frameTime(9, 25)), 0);
});

test("captions break on pauses, sentences and dangling prepositions", () => {
  const words = [
    w("Привет.", 0, 0.5), w("Это", 0.6, 0.8), w("длинная", 0.8, 1.2), w("пауза", 1.2, 1.5),
    w("после", 2.5, 2.8), w("неё", 2.8, 3), w("идёт", 3, 3.2), w("в", 3.2, 3.3), w("дом", 3.3, 3.6),
  ];
  const pages = captionPages(words).map((p) => words.slice(p.wordStart, p.wordEnd + 1).map((x) => x.text).join(" "));
  assert.deepEqual(pages, ["Привет.", "Это длинная пауза", "после неё идёт", "в дом"]);
  const plan = buildMontagePlan(job(words));
  const captions = plan.events.filter((e) => e.type === "caption");
  for (let i = 1; i < captions.length; i++) assert.ok(captions[i - 1].end <= captions[i].start + 1e-9);
});

test("long Russian words fit the caption width without splitting", () => {
  const maxWidth = 1080 - 100 - 120;
  for (const page of [["высококвалифицированный"], ["коммерческими"], ["предложениями"], ["частнопредпринимательской", "деятельности"]]) {
    const size = captionFontSize(page, maxWidth);
    assert.ok(size >= 52 && size <= 92);
    for (const word of page) assert.ok(word.length * CHAR_EM * size <= maxWidth || size === 52, word);
    assert.ok(wrapLines(page, size, maxWidth).length <= 2);
  }
  const words = [w("высококвалифицированный", 0, 1.2), w("специалист", 1.2, 1.8)];
  const pages = captionPages(words);
  assert.equal(pages.length, 2, "page character budget keeps very long words alone");
});

test("short clip: one word, all events inside duration", () => {
  const j = job([w("Claude", 0.1, 0.6)]);
  j.sourceVideo.duration = 0.8;
  const plan = buildMontagePlan(j);
  assert.ok(plan.events.every((e) => e.end <= 0.8));
  assert.equal(plan.events.filter((e) => e.type === "caption").length, 1);
});

test("no recognised term: captions only, no invented accent", () => {
  const plan = buildMontagePlan(job([w("Просто", 0, 0.5), w("говорю.", 0.5, 1)]));
  assert.deepEqual(plan.events.map((e) => e.type), ["caption"]);
});

test("plan validation rejects missing assets, bad anchors and overlaps", () => {
  const base = job([w("Скопируй", 0, 1), w("в", 1, 1.2), w("Claude", 1.2, 2)]);
  const ev = (patch: Partial<MontageEvent>): MontageEvent => ({
    id: "e", type: "card", start: 0, end: 1, wordStart: 0, wordEnd: 0, animation: "pop", position: "top",
    layer: 2, transition: "fade", respectSafeZone: true, ...patch,
  });
  const bad: Array<[MontageEvent[], RegExp]> = [
    [[ev({ type: "b_roll" })], /assetId required/],
    [[ev({ type: "interface", assetId: "screen" })], /unknown assetId/],
    [[ev({ assetId: "missing" })], /unknown assetId/],
    [[ev({ wordEnd: 5 })], /out of range/],
    [[ev({ start: 0.5 })], /does not cover/],
    [[ev({ end: 11 })], /after source duration/],
    [[ev({ type: "split_screen" })], /not supported/],
    [[ev({ id: "a" }), ev({ id: "b", start: 0.5, end: 1.5, wordStart: 1, wordEnd: 1 })], /overlap/],
    [[ev({ id: "a" }), ev({ id: "a", start: 1, end: 2, wordStart: 1, wordEnd: 1 })], /duplicate id/],
  ];
  for (const [events, reason] of bad) assert.throws(() => validateMontagePlan(base, { events }), reason);
  // accents on different positions/layers may overlap; a real asset id is accepted
  const ok = { ...base, visualAssets: [{ id: "logo", type: "image", localPath: "ai/claude-w.svg", rightsReference: "own" }] };
  validateMontagePlan(ok, { events: [ev({ assetId: "logo" }), ev({ id: "z", type: "zoom", position: "full_frame", layer: 0 })] });
});
