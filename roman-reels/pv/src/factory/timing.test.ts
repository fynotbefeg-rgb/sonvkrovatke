// Run: node --experimental-strip-types --test src/factory/timing.test.ts   (from roman-reels/pv)
// Regression for Codex PR #6 review C1: short/trimmed accents and zoom must give Remotion
// interpolate a strictly increasing inputRange.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { Easing, interpolate } from "remotion";
import { buildMontagePlan, frameTime } from "./director.ts";
import type { FactoryJob, MontageEvent, Word } from "./director.ts";
import { FADES, fadeKeyframes, MAX_FADE_SHARE, strictlyIncreasing } from "./timing.ts";

const FPS = 25;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const w = (text: string, start: number, end: number): Word => ({ text, start, end });
const job = (words: Word[], duration = 30): FactoryJob => ({
  schemaVersion: "1.0.0",
  reelId: "R-test-h1",
  sourceVideo: { localPath: "rr/test.mp4", sha256: "0".repeat(64), duration, width: 1080, height: 1920, fps: FPS },
  wordTimings: words,
});
const fadesFor = (e: MontageEvent) => (e.type === "zoom" ? FADES.zoom : FADES.accent);
const animated = (plan: { events: MontageEvent[] }) => plan.events.filter((e) => e.type !== "caption");

/** Same call the composition makes, on every frame inside the event plus both edges. */
function renderEnvelope(e: MontageEvent): number[] {
  const { in: fadeIn, out: fadeOut } = fadesFor(e);
  const range = fadeKeyframes(e.start, e.end, fadeIn, fadeOut);
  assert.ok(range, `${e.id}: keyframes`);
  assert.ok(strictlyIncreasing(range), `${e.id}: ${range}`);
  const times = [e.start, e.end];
  for (let f = Math.floor(e.start * FPS); f <= Math.ceil(e.end * FPS); f++) times.push(frameTime(f, FPS));
  return times.map((t) => {
    const v = interpolate(t, range, [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
    assert.ok(v >= 0 && v <= 1, `${e.id}: value ${v} at ${t}`);
    return v;
  });
}

test("Codex C1 reproduction: adjacent Claude/Gemini terms", () => {
  const plan = buildMontagePlan(job([w("Claude", 1, 1.1), w("Gemini", 1.11, 1.2)]));
  const first = plan.events.find((e) => e.id === "keyword-01");
  assert.ok(first);
  assert.ok(Math.abs(first.start - 0.92) < 1e-9 && Math.abs(first.end - 1.1) < 1e-9, "Director output unchanged by the fix");
  // the old fixed-length envelope produced [0.92, 1.14, 0.85, 1.1] and Remotion threw
  assert.throws(
    () => interpolate(1, [first.start, first.start + 0.22, first.end - 0.25, first.end], [0, 1, 1, 0]),
    /strictly monotonically increasing/,
  );
  for (const e of animated(plan)) renderEnvelope(e);
});

test("several back-to-back terms all render", () => {
  const words = [w("Claude", 2, 2.15), w("Gemini", 2.16, 2.3), w("Telegram", 2.31, 2.5), w("WhatsApp", 2.5, 2.62)];
  const plan = buildMontagePlan(job(words));
  const accents = animated(plan);
  assert.ok(accents.length >= 3);
  for (const e of accents) {
    const values = renderEnvelope(e);
    assert.ok(Math.max(...values) > 0.99, `${e.id} reaches full opacity`);
  }
});

test("short zoom trimmed by the next accent", () => {
  // "10 секунд" then a tool name right after: the number accent (and its zoom) gets a short window
  const words = [w("Это", 4, 4.3), w("10", 5, 5.1), w("секунд", 5.1, 5.3), w("Claude", 5.31, 5.6)];
  const plan = buildMontagePlan(job(words));
  const zoom = plan.events.find((e) => e.type === "zoom");
  assert.ok(zoom, "zoom on the spoken number");
  assert.ok(zoom.end - zoom.start < FADES.zoom.in + FADES.zoom.out, "zoom is shorter than its nominal fades");
  renderEnvelope(zoom);
  for (const e of animated(plan)) renderEnvelope(e);
});

test("accent clamped by the end of the video", () => {
  const plan = buildMontagePlan(job([w("Привет", 9, 9.5), w("Claude", 9.9, 9.95)], 10));
  const last = plan.events.find((e) => e.type === "keyword");
  assert.ok(last);
  assert.ok(last.end <= 10 && last.end - last.start < FADES.accent.in + FADES.accent.out);
  const values = renderEnvelope(last);
  assert.equal(values[1], 0, "fully faded at the end of the event");
});

test("fade keyframes: nominal when long, proportional when short", () => {
  assert.deepEqual(fadeKeyframes(0, 3, 0.22, 0.25), [0, 0.22, 2.75, 3]);
  for (let length = 0.01; length <= 3; length += 0.01) {
    for (const { in: a, out: b } of [FADES.accent, FADES.zoom]) {
      const range = fadeKeyframes(10, 10 + length, a, b);
      assert.ok(range && strictlyIncreasing(range), `length ${length}`);
      const plateau = range[2] - range[1];
      assert.ok(plateau >= (1 - MAX_FADE_SHARE) * length - 1e-9, `visible plateau at length ${length}`);
      assert.ok(range[1] - range[0] <= a + 1e-12 && range[3] - range[2] <= b + 1e-12);
    }
  }
});

test("fade keyframes reject invalid input and degrade on float collapse", () => {
  assert.throws(() => fadeKeyframes(1, 1, 0.2, 0.2), /positive length/);
  assert.throws(() => fadeKeyframes(2, 1, 0.2, 0.2), /positive length/);
  assert.throws(() => fadeKeyframes(0, 1, 0, 0.2), /positive/);
  assert.throws(() => fadeKeyframes(0, Number.NaN, 0.2, 0.2), /Non-finite/);
  assert.equal(fadeKeyframes(1e9, 1e9 + 1e-7, 0.2, 0.2), null, "sub-frame event: shown without fades");
});

test("real assembled jobs: every accent and zoom renders on every frame", () => {
  for (const h of ["h1", "h2", "h3"]) {
    const url = new URL(`../../../research/first-montage-v1/assembled-jobs/R-ai-shared-body-fixture-${h}-job.json`, import.meta.url);
    const plan = buildMontagePlan(JSON.parse(readFileSync(url, "utf8")) as FactoryJob);
    for (const e of animated(plan)) renderEnvelope(e);
  }
});
