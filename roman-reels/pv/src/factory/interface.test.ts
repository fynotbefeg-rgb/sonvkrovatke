import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildMontagePlan, validateMontagePlan } from "./director.ts";
import type { FactoryJob } from "./director.ts";

const fixture = JSON.parse(readFileSync(new URL(
  "../../../research/first-montage-v1/assembled-jobs/R-ai-shared-body-fixture-h1-job.json", import.meta.url), "utf8")) as FactoryJob;
const asset = { id: "tool-claude", type: "image", localPath: "rr/demos/client-reply.svg", rightsReference: "Original illustrative demo; no customer data or product screenshot" };
const withAsset = (): FactoryJob => ({ ...fixture, visualAssets: [{ ...asset }] });

test("provided demo replaces only the spoken Claude chip, captions and speech stay intact", () => {
  const base = buildMontagePlan(fixture);
  const job = withAsset();
  const plan = buildMontagePlan(job);
  const events = plan.events.filter((e) => e.type === "interface");
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(job.wordTimings[event.wordStart].text.toLowerCase().replace(/[.,]/g, ""), "claude");
  assert.equal(event.wordEnd, event.wordStart);
  assert.equal(event.assetId, asset.id);
  assert.equal(event.position, "top");
  assert.deepEqual(plan.events.filter((e) => e.type === "caption"), base.events.filter((e) => e.type === "caption"));
  assert.equal(plan.events.filter((e) => !["caption", "zoom"].includes(e.type)).length,
    base.events.filter((e) => !["caption", "zoom"].includes(e.type)).length);
  validateMontagePlan(job, plan);
});

test("no asset keeps all three existing committed plans unchanged", () => {
  for (const hook of ["h1", "h2", "h3"]) {
    const j = JSON.parse(readFileSync(new URL(`../../../research/first-montage-v1/assembled-jobs/R-ai-shared-body-fixture-${hook}-job.json`, import.meta.url), "utf8"));
    const old = JSON.parse(readFileSync(new URL(`../../../research/first-montage-v1/claude-montage/R-ai-shared-body-fixture-${hook}-plan.json`, import.meta.url), "utf8"));
    assert.deepEqual(buildMontagePlan(j), old);
  }
});

test("unknown asset name does not create an invented visual event", () => {
  const j = withAsset(); j.visualAssets![0].id = "unanchored-demo";
  assert.deepEqual(buildMontagePlan(j), buildMontagePlan(fixture));
});

test("video and unsupported formats cannot masquerade as interface images", () => {
  for (const [type, path] of [["video", "rr/demo.mp4"], ["image", "rr/demo.html"]]) {
    const j = withAsset(); Object.assign(j.visualAssets![0], { type, localPath: path });
    assert.throws(() => buildMontagePlan(j), /interface requires a local image/);
  }
});

test("assets without rights fail and center placement fails the safe-band gate", () => {
  const j = withAsset(); j.visualAssets![0].rightsReference = " ";
  assert.throws(() => buildMontagePlan(j), /rights reference/);
  const valid = withAsset(); const plan = buildMontagePlan(valid);
  plan.events.find((e) => e.type === "interface")!.position = "center";
  assert.throws(() => validateMontagePlan(valid, plan), /top safe band/);
});

test("adjacent tool demonstrations never overlap or lose their spoken anchor", () => {
  const j = withAsset(); j.wordTimings = [{text:"Claude",start:1,end:1.1},{text:"Gemini",start:1.11,end:1.2}];
  j.sourceVideo = { ...fixture.sourceVideo, duration: 15 };
  j.visualAssets!.push({ ...asset, id: "tool-gemini" });
  const events = buildMontagePlan(j).events.filter((e) => e.type === "interface");
  assert.equal(events.length, 2);
  assert.ok(events[0].end <= events[1].start);
  validateMontagePlan(j, {events});
});
