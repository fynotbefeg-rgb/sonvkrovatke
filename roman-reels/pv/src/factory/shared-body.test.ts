// Offline fictional data only: synthetic words and timings shaped like the assembler/prepare output; no media, no render.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildMontagePlan, buildSharedBodyPlans, eventLabel, validateMontagePlan } from "./director.ts";
import type { FactoryJob, MontagePlan, Word } from "./director.ts";

const BODY = "Сегодня разберём простой способ проверки заголовка страницы. Возьмём 12 клиентов за 30 дней и сравним показы с кликами. " +
  "Сначала соберём заявки, звонки, письма и чаты в одну таблицу. Потом попросим Claude предложить новый заголовок. " +
  "Это только гипотеза, её нужно проверить на данных. Затем сравним результат через 14 дней и запишем вывод. Сохрани этот пример для своей страницы.";
// Shorter body whose own duration sits in the last seconds before a multiple of 6, with more candidates than its budget.
const BODY_NEAR_18 = "Возьмём 12 клиентов за 30 дней. Соберём заявки, звонки, письма и чаты в таблицу. Через 14 дней сравним итог. " +
  "Это учебный пример без настоящих данных клиента и без обещаний. Сохрани этот пример.";
const HOOKS = {
  short: "Заголовок решает всё.",
  withNumber: "Страница в выдаче, но кликов мало: проверим заголовок за 5 минут. Покажу на выдуманном примере.",
  long: "Многие владельцы сайтов годами не трогают заголовки страниц, потому что не знают, с чего начать проверку, и каждый раз откладывают это на потом. Сегодня покажу простой выдуманный пример без сложных инструментов.",
};
const LEAD_SILENCE = 0.42; // the body file starts with silence; it belongs to the shared part
const letters = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, "").length;
function timed(text: string, t0: number): Word[] {
  const out: Word[] = [];
  let t = t0;
  for (const w of text.split(/\s+/)) {
    const d = 0.34 + 0.045 * letters(w);
    out.push({ text: w, start: +t.toFixed(3), end: +(t + d).toFixed(3) });
    t += d + (/[.!?]$/.test(w) ? 0.5 : /[,:;]$/.test(w) ? 0.18 : 0.03);
  }
  return out;
}
const frames = (s: number) => Math.ceil(s * 25) / 25; // assembler: every part is padded to whole frames
const round6 = (x: number) => Math.round(x * 1e6) / 1e6; // prepare-assembled-jobs: shifted(..., offset) rounds to 6 decimals

/** Mirrors assemble-source-set + prepare-assembled-jobs: part timelines, offset = hook length, rounded shifted words. */
function assembly(bodyText: string, hookTexts: string[]) {
  const body = timed(bodyText, LEAD_SILENCE);
  const bodyOriginal = body[body.length - 1].end + 0.35;
  const bodyLength = frames(bodyOriginal);
  const variants = hookTexts.map((text, i) => {
    const hook = timed(text, 0.1);
    const bodyStart = frames(hook[hook.length - 1].end + 0.25);
    const words = [...hook, ...body.map((w) => ({ ...w, start: round6(w.start + bodyStart), end: round6(w.end + bodyStart) }))];
    const job: FactoryJob = {
      schemaVersion: "1.0.0", reelId: `R-shared-body-test-h${i + 1}`,
      // probe() may report a few ms less than the frame cursor; the shared plan must still fit
      sourceVideo: { localPath: `rr/incoming/SHARED-BODY-TEST/R-shared-body-test-h${i + 1}.mp4`, sha256: "0".repeat(64),
        duration: +(bodyStart + bodyLength - 0.02).toFixed(2), width: 1080, height: 1920, fps: 25 },
      wordTimings: words,
    };
    return { job, hookWordCount: hook.length, bodyStart };
  });
  return { input: { body: { wordTimings: body, duration: bodyLength }, variants }, bodyLength };
}
const accents = (plan: MontagePlan, pick = (_: number) => true) =>
  plan.events.filter((e) => e.type !== "caption" && e.type !== "zoom" && pick(e.wordStart));
/** The exact (no-epsilon) checks of validate-factory-job.py, so the Python contract accepts these plans too. */
function contractCovers(job: FactoryJob, plan: MontagePlan) {
  const ids = new Set<string>();
  for (const e of plan.events) {
    assert.ok(!ids.has(e.id)); ids.add(e.id);
    assert.ok(0 <= e.start && e.start < e.end && e.end <= job.sourceVideo.duration, `${e.id} inside source`);
    assert.ok(e.start <= job.wordTimings[e.wordStart].start && e.end >= job.wordTimings[e.wordEnd].end, `${e.id} covers words`);
  }
}

test("one body plan, identical in every variant: same ids, types, words and times from the body start", () => {
  const { input } = assembly(BODY, Object.values(HOOKS));
  const out = buildSharedBodyPlans(input);
  assert.ok(input.variants[0].job.sourceVideo.duration < input.variants[2].job.sourceVideo.duration - 15);
  const ref = out.body.events;
  assert.ok(ref.some((e) => e.type === "zoom") && ref.some((e) => e.type === "card") && ref.some((e) => e.type === "diagram"));
  // the leading silence is part of the shared timeline: the first body word stays at 0.42 s after the body start
  assert.equal(ref.find((e) => e.type === "caption")!.start, LEAD_SILENCE);
  out.variants.forEach((plan, i) => {
    const { job, hookWordCount, bodyStart } = input.variants[i];
    const body = plan.events.filter((e) => e.wordStart >= hookWordCount);
    assert.deepEqual(body.map((e) => e.id), ref.map((e) => `body-${e.id}`));
    body.forEach((e, k) => {
      const r = ref[k];
      assert.equal(e.type, r.type);
      assert.equal(e.wordStart - hookWordCount, r.wordStart);
      assert.equal(eventLabel(job.wordTimings, e), eventLabel(input.body.wordTimings, r));
      assert.ok(Math.abs(e.start - bodyStart - r.start) <= 2e-6 && Math.abs(e.end - bodyStart - r.end) <= 2e-6, e.id);
    });
  });
});

test("a number in the hook keeps its card but never takes the body zoom; one zoom per reel", () => {
  const { input } = assembly(BODY, [HOOKS.withNumber]);
  const plan = buildSharedBodyPlans(input).variants[0];
  const { job, hookWordCount } = input.variants[0];
  assert.ok(accents(plan, (w) => w < hookWordCount).some((e) => e.type === "number"));
  const zooms = plan.events.filter((e) => e.type === "zoom");
  assert.equal(zooms.length, 1);
  assert.ok(zooms[0].wordStart >= hookWordCount);
  const single = buildMontagePlan(job).events.filter((e) => e.type === "zoom"); // the old single pass, for contrast
  assert.ok(single.length === 1 && single[0].wordStart < hookWordCount);
});

test("accent budget near a 6-second boundary comes from the body alone", () => {
  const { input, bodyLength } = assembly(BODY_NEAR_18, Object.values(HOOKS));
  assert.ok(bodyLength % 6 > 3.5, `body ${bodyLength} s must sit just under a multiple of 6`);
  const totals = input.variants.map((v) => Math.floor(v.job.sourceVideo.duration / 6));
  assert.ok(new Set(totals).size === 3, `variant totals cross different 6 s boundaries: ${totals}`);
  const out = buildSharedBodyPlans(input);
  const budget = Math.floor(Math.min(bodyLength, ...input.variants.map((v) => v.job.sourceVideo.duration - v.bodyStart)) / 6);
  assert.equal(accents(out.body).length, budget);
  const singles = input.variants.map((v) => accents(buildMontagePlan(v.job), (w) => w >= v.hookWordCount).length);
  assert.ok(new Set(singles).size > 1, `the old single pass gives the body a different budget per hook: ${singles}`);
  out.variants.forEach((plan, i) => {
    const v = input.variants[i];
    assert.deepEqual(accents(plan, (w) => w >= v.hookWordCount).map((e) => [e.type, e.wordStart - v.hookWordCount]),
      accents(out.body).map((e) => [e.type, e.wordStart]));
  });
});

test("the closing call to action sits in the last 30% of the body in every variant; hooks never get one", () => {
  const { input, bodyLength } = assembly(BODY, Object.values(HOOKS));
  const out = buildSharedBodyPlans(input);
  const imperative = assembly(BODY, ["Смотри, что получилось. Сохрани."]).input;
  const hookCards = buildSharedBodyPlans(imperative).variants[0].events.filter((e) => e.type === "card");
  assert.ok(hookCards.length === 1 && hookCards[0].wordStart >= imperative.variants[0].hookWordCount);
  const card = out.body.events.filter((e) => e.type === "card");
  assert.equal(card.length, 1);
  assert.ok(input.body.wordTimings[card[0].wordStart].start >= bodyLength * 0.7);
  out.variants.forEach((plan, i) => {
    const v = input.variants[i];
    const cards = plan.events.filter((e) => e.type === "card");
    assert.equal(cards.length, 1);
    assert.ok(cards[0].wordStart >= v.hookWordCount);
    assert.ok(Math.abs(cards[0].start - v.bodyStart - card[0].start) <= 2e-6);
  });
});

test("every final plan passes validateMontagePlan and the exact contract checks; hook and body never overlap", () => {
  for (const text of [BODY, BODY_NEAR_18]) {
    const { input } = assembly(text, Object.values(HOOKS));
    buildSharedBodyPlans(input).variants.forEach((plan, i) => {
      const { job, hookWordCount, bodyStart } = input.variants[i];
      validateMontagePlan(job, plan);
      contractCovers(job, plan);
      const hookEnd = Math.max(...plan.events.filter((e) => e.wordEnd < hookWordCount).map((e) => e.end));
      assert.ok(hookEnd <= bodyStart + 1e-9);
    });
  }
});

test("wrong boundaries or a body that is not the shared one are refused", () => {
  const { input } = assembly(BODY, [HOOKS.short]);
  const v = input.variants[0];
  const run = (variant: typeof v) => buildSharedBodyPlans({ ...input, variants: [variant] });
  for (const hookWordCount of [0, v.hookWordCount - 1, v.hookWordCount + 1, 1.5]) assert.throws(() => run({ ...v, hookWordCount }));
  assert.throws(() => run({ ...v, bodyStart: v.bodyStart + 0.04 }), /shifted by bodyStart/);
  assert.throws(() => run({ ...v, bodyStart: 0.1 }), /overlaps/);
  const renamed = { ...v, job: { ...v.job, wordTimings: v.job.wordTimings.map((w, i) => i === v.hookWordCount + 3 ? { ...w, text: "другое" } : w) } };
  assert.throws(() => run(renamed), /shared body/);
  assert.throws(() => buildSharedBodyPlans({ ...input, variants: [] }));
});

test("normal single-reel mode is unchanged", () => {
  const { input } = assembly(BODY, [HOOKS.short]);
  assert.deepEqual(buildMontagePlan(input.variants[0].job, {}), buildMontagePlan(input.variants[0].job));
  for (const hook of ["h1", "h2", "h3"]) {
    const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    const job = read(`../../../research/first-montage-v1/assembled-jobs/R-ai-shared-body-fixture-${hook}-job.json`);
    const committed = read(`../../../research/first-montage-v1/claude-montage/R-ai-shared-body-fixture-${hook}-plan.json`);
    assert.deepEqual(buildMontagePlan(job), committed);
  }
});
