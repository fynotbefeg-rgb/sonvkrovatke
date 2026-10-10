import { loadFont } from "@remotion/fonts";
import React from "react";
import {
  AbsoluteFill, CalculateMetadataFunction, Easing, Img, OffthreadVideo, interpolate, staticFile,
  useCurrentFrame, useVideoConfig,
} from "remotion";
import {
  activeWordIndex, assertJob, buildMontagePlan, displayWord, eventLabel, frameTime, listItemLabel, listItemRanges,
  safeZoneOf, validateMontagePlan,
} from "./director.ts";
import type { FactoryJob, MontageEvent, MontagePlan, SafeZone, VisualAsset, Word } from "./director.ts";
import { captionFontSize, CAPTION_LINE_HEIGHT, conservativeLayout } from "./layout.ts";
import { FADES, fadeKeyframes } from "./timing.ts";

// RomanFactoryV1: full assembled source MP4 (hook already inside) + word captions + Director accents.
// Source time = output time: no cuts, no speed change, the original audio track is kept as is.

const FONT = "Golos Text";
const CYRILLIC = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LATIN = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD";
loadFont({ family: FONT, url: staticFile("fonts/golos-cyr.woff2"), weight: "400 900", unicodeRange: CYRILLIC });
loadFont({ family: FONT, url: staticFile("fonts/golos-lat.woff2"), weight: "400 900", unicodeRange: LATIN });

const C = { accent: "#FFD400", ink: "#111111", white: "#FFFFFF", glass: "rgba(17,17,17,0.78)" };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

export type FactoryProps = Partial<FactoryJob> & Record<string, unknown>;
type Ready = { job: FactoryJob; plan: MontagePlan; zone: SafeZone };

const PLACEHOLDER_FPS = 25;

/** Validates props once; a job without a plan gets one from the Director (same pure function). */
export function prepare(props: FactoryProps): Ready | null {
  if (!props || props.schemaVersion === undefined || !props.sourceVideo || !props.wordTimings) return null;
  const job = props as unknown as FactoryJob;
  assertJob(job);
  const plan = job.montagePlan ?? buildMontagePlan(job);
  validateMontagePlan(job, plan);
  return { job, plan, zone: safeZoneOf(job) };
}

export const calculateFactoryMetadata: CalculateMetadataFunction<FactoryProps> = ({ props }) => {
  const ready = prepare(props);
  if (!ready) return { durationInFrames: 2 * PLACEHOLDER_FPS, fps: PLACEHOLDER_FPS, width: 1080, height: 1920 };
  const { sourceVideo, renderSettings } = ready.job;
  const fps = renderSettings?.fps ?? sourceVideo.fps;
  if (renderSettings && (renderSettings.width !== 1080 || renderSettings.height !== 1920)) {
    throw new Error("RomanFactoryV1 renders 1080×1920 only");
  }
  return { durationInFrames: Math.ceil(sourceVideo.duration * fps - 1e-9), fps, width: 1080, height: 1920 };
};

const NoSource: React.FC = () => (
  <AbsoluteFill style={{ background: "#0d0f12", alignItems: "center", justifyContent: "center", padding: 120 }}>
    <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 64, color: C.white, textAlign: "center", lineHeight: 1.2 }}>
      Нет проверенного исходника
    </div>
    <div style={{ fontFamily: FONT, fontWeight: 500, fontSize: 36, color: "#9aa3ad", textAlign: "center", marginTop: 32 }}>
      Передайте job v1 через --props: sourceVideo и wordTimings из реального аудио
    </div>
  </AbsoluteFill>
);

const active = (events: MontageEvent[], t: number) => events.filter((e) => e.start <= t && t < e.end);

// Smooth in/out envelope of an event; fade lengths scale down for short (trimmed) events.
const envelope = (event: MontageEvent, t: number, inS: number, outS: number) => {
  const range = fadeKeyframes(event.start, event.end, inS, outS);
  if (!range) return t >= event.start && t < event.end ? 1 : 0;
  return interpolate(t, range, [0, 1, 1, 0], { ...clamp, easing: EASE });
};

const ZoomedSource: React.FC<{ job: FactoryJob; zooms: MontageEvent[]; t: number }> = ({ job, zooms, t }) => {
  const zoom = zooms.find((e) => e.start <= t && t < e.end);
  const scale = zoom ? 1 + (conservativeLayout.zoomScale - 1) * envelope(zoom, t, FADES.zoom.in, FADES.zoom.out) : 1;
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: conservativeLayout.zoomOrigin }}>
      <OffthreadVideo src={staticFile(job.sourceVideo.localPath)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </AbsoluteFill>
  );
};

const Caption: React.FC<{ event: MontageEvent; words: Word[]; t: number; zone: SafeZone; width: number; height: number }> = ({
  event, words, t, zone, width, height,
}) => {
  const page = words.slice(event.wordStart, event.wordEnd + 1).map((w) => displayWord(w.text));
  const maxWidth = width - zone.left - zone.right;
  const fontSize = captionFontSize(page, maxWidth);
  const appear = interpolate(t, [event.start, event.start + 0.15], [0, 1], { ...clamp, easing: EASE });
  const current = activeWordIndex(words, event, t);
  return (
    <div style={{
      position: "absolute", left: zone.left, right: zone.right, bottom: zone.bottom + conservativeLayout.captionLift,
      display: "flex", flexWrap: "wrap", justifyContent: "center", alignContent: "flex-end", columnGap: fontSize * 0.42,
      opacity: appear, transform: `translateY(${(1 - appear) * 18}px) scale(${0.94 + 0.06 * appear})`,
      maxHeight: height * 0.2,
    }}>
      {page.map((text, k) => {
        const index = event.wordStart + k;
        const isActive = index === current;
        const pop = isActive ? interpolate(t, [words[index].start, words[index].start + 0.12], [1.12, 1.06], clamp) : 1;
        return (
          <span key={index} style={{
            fontFamily: FONT, fontWeight: 900, fontSize, lineHeight: CAPTION_LINE_HEIGHT, color: isActive ? C.accent : C.white,
            display: "inline-block", transform: `scale(${pop})`, letterSpacing: -0.5,
            WebkitTextStroke: `${Math.round(fontSize / 9)}px ${C.ink}`, paintOrder: "stroke fill",
            textShadow: "0 6px 18px rgba(0,0,0,0.45)",
          }}>{text}</span>
        );
      })}
    </div>
  );
};

const TopBand: React.FC<{ zone: SafeZone; width: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  zone, width, children, style,
}) => (
  <div style={{
    position: "absolute", top: zone.top + conservativeLayout.topInset, left: zone.left, width: width - zone.left - zone.right,
    maxHeight: conservativeLayout.topBandHeight, display: "flex", flexDirection: "column", alignItems: "center", ...style,
  }}>{children}</div>
);

const Accent: React.FC<{ event: MontageEvent; words: Word[]; assets: VisualAsset[]; t: number; zone: SafeZone; width: number }> = ({ event, words, assets, t, zone, width }) => {
  const k = envelope(event, t, FADES.accent.in, FADES.accent.out);
  const pop = interpolate(t, [event.start, event.start + 0.18, event.start + 0.3], [0.7, 1.06, 1], { ...clamp, easing: EASE });
  if (event.type === "interface") {
    const asset = assets.find((a) => a.id === event.assetId)!; // validated in prepare()
    return (
      <TopBand zone={zone} width={width} style={{ opacity: k, transform: `translateY(${(1 - k) * -18}px)` }}>
        <Img src={staticFile(asset.localPath)} style={{
          width: "100%", height: conservativeLayout.topBandHeight, objectFit: "contain",
        }} />
      </TopBand>
    );
  }
  if (event.type === "diagram") {
    const items = listItemRanges(words, event.wordStart, event.wordEnd);
    return (
      <TopBand zone={zone} width={width} style={{ opacity: k, transform: `translateY(${(1 - k) * -30}px)` }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 18 }}>
          {items.map((range, i) => {
            const from = words[range[0]].start;
            const shown = interpolate(t, [from - 0.06, from + 0.16], [0, 1], { ...clamp, easing: EASE });
            const latest = i === items.length - 1 ? t >= from : t >= from && t < words[items[i + 1][0]].start;
            return (
              <div key={i} style={{
                fontFamily: FONT, fontWeight: 800, fontSize: 46, lineHeight: 1.1, padding: "16px 28px", borderRadius: 999,
                background: latest ? C.accent : C.glass, color: latest ? C.ink : C.white,
                opacity: shown, transform: `scale(${0.8 + 0.2 * shown})`, boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
              }}>{listItemLabel(words, range)}</div>
            );
          })}
        </div>
      </TopBand>
    );
  }
  const label = eventLabel(words, event);
  if (event.type === "number") {
    return (
      <TopBand zone={zone} width={width} style={{ opacity: k }}>
        <div style={{
          fontFamily: FONT, fontWeight: 900, fontSize: label.length > 8 ? 104 : 128, lineHeight: 1, color: C.ink,
          background: C.accent, padding: "22px 48px", borderRadius: 36, transform: `scale(${pop}) rotate(-2deg)`,
          boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
        }}>{label}</div>
      </TopBand>
    );
  }
  if (event.type === "keyword") {
    return (
      <TopBand zone={zone} width={width} style={{ opacity: k }}>
        <div style={{
          fontFamily: FONT, fontWeight: 900, fontSize: 76, lineHeight: 1, color: C.white, background: C.ink,
          padding: "22px 44px", borderRadius: 28, transform: `scale(${pop})`, border: `5px solid ${C.accent}`,
          boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
        }}>{label}</div>
      </TopBand>
    );
  }
  // card: call to action / short thesis made only of the spoken words
  return (
    <TopBand zone={zone} width={width} style={{ opacity: k }}>
      <div style={{
        fontFamily: FONT, fontWeight: 900, fontSize: 64, lineHeight: 1.1, color: C.ink, background: C.accent,
        padding: "24px 40px", borderRadius: 30, textAlign: "center", transform: `scale(${pop})`,
        boxShadow: "0 16px 40px rgba(0,0,0,0.3)",
      }}>{label}</div>
      <div style={{
        width: 0, height: 0, borderLeft: "26px solid transparent", borderRight: "26px solid transparent",
        borderTop: `30px solid ${C.accent}`, marginTop: -2, opacity: k,
      }} />
    </TopBand>
  );
};

export const RomanFactoryV1: React.FC<FactoryProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ready = prepare(props);
  if (!ready) return <NoSource />;
  const { job, plan, zone } = ready;
  const t = frameTime(frame, fps);
  const words = job.wordTimings;
  const zooms = plan.events.filter((e) => e.type === "zoom");
  const captions = active(plan.events.filter((e) => e.type === "caption"), t);
  const accents = active(plan.events.filter((e) => e.type !== "caption" && e.type !== "zoom"), t);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <ZoomedSource job={job} zooms={zooms} t={t} />
      {accents.map((e) => <Accent key={e.id} event={e} words={words} assets={job.visualAssets ?? []} t={t} zone={zone} width={width} />)}
      {captions.map((e) => <Caption key={e.id} event={e} words={words} t={t} zone={zone} width={width} height={height} />)}
    </AbsoluteFill>
  );
};
