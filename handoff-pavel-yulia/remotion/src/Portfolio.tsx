import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/fonts";
import { Video } from "@remotion/media";

const CYR = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LAT = "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
for (const [family, file] of [["Literata", "literata"], ["Golos Text", "golos"]]) {
  loadFont({ family, url: staticFile(`fonts/${file}-cyr.woff2`), weight: "400 900", unicodeRange: CYR });
  loadFont({ family, url: staticFile(`fonts/${file}-lat.woff2`), weight: "400 900", unicodeRange: LAT });
}
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

type Shot = { src: string; from: number; kicker: string; title: string };
type Style = { font: string; weight: number; upper: boolean; accent: string; grade: string; titleSize: number };

// Клип с плавным входом/выходом и медленным наездом
const Clip: React.FC<{ shot: Shot; dur: number; grade: string }> = ({ shot, dur, grade }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 10, dur - 6, dur], [0, 1, 1, 0.999], clamp);
  const s = interpolate(f, [0, dur], [1.12, 1.02]);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <AbsoluteFill style={{ transform: `scale(${s})`, filter: grade }}>
        <Video src={staticFile(`clips/${shot.src}`)} trimBefore={Math.round(shot.from * 30)} muted objectFit="cover" style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,.15) 55%,rgba(0,0,0,.78) 100%)" }} />
    </AbsoluteFill>
  );
};

// Слова заголовка выезжают снизу по очереди
const Kinetic: React.FC<{ shot: Shot; st: Style }> = ({ shot, st }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = shot.title.split(" ");
  const k = interpolate(f, [4, 16], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 80px 260px" }}>
      <div style={{ fontFamily: "Golos Text", fontWeight: 700, fontSize: 34, letterSpacing: 6, textTransform: "uppercase", color: st.accent, opacity: k, transform: `translateY(${(1 - k) * 20}px)`, marginBottom: 26 }}>{shot.kicker}</div>
      <div style={{ fontFamily: st.font, fontWeight: st.weight, fontSize: st.titleSize, lineHeight: 1.02, color: "#fff", textTransform: st.upper ? "uppercase" : "none", letterSpacing: st.upper ? -1 : -2, textShadow: "0 4px 30px rgba(0,0,0,.35)" }}>
        {words.map((w, i) => {
          const p = spring({ frame: f - 8 - i * 4, fps, config: { damping: 200 } });
          return (
            <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", marginRight: 22, paddingBottom: "0.14em", marginBottom: "-0.14em" }}>
              <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%)` }}>{w}</span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ brand: string; line: string; cta: string; st: Style; bg: string }> = ({ brand, line, cta, st, bg }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f, fps, config: { damping: 200 } });
  const b = spring({ frame: f - 12, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center", textAlign: "center", opacity: interpolate(f, [0, 8], [0, 1], clamp) }}>
      <div style={{ fontFamily: st.font, fontWeight: st.weight, fontSize: 130, color: "#fff", textTransform: st.upper ? "uppercase" : "none", transform: `scale(${0.9 + p * 0.1})`, letterSpacing: st.upper ? 4 : -2 }}>{brand}</div>
      <div style={{ fontFamily: "Golos Text", fontSize: 44, color: "rgba(255,255,255,.75)", marginTop: 26, opacity: p }}>{line}</div>
      <div style={{ marginTop: 80, background: st.accent, color: "#111", fontFamily: "Golos Text", fontWeight: 700, fontSize: 44, padding: "30px 64px", borderRadius: 999, transform: `scale(${b})` }}>{cta}</div>
    </AbsoluteFill>
  );
};

export type PromoProps = { shots: Shot[]; st: Style; brand: string; line: string; cta: string; endBg: string };
export const SHOT = 75;
export const END = 75;

export const Promo: React.FC<PromoProps> = ({ shots, st, brand, line, cta, endBg }) => (
  <AbsoluteFill style={{ background: "#000" }}>
    {shots.map((s, i) => (
      <Sequence key={i} from={i * SHOT} durationInFrames={SHOT + 8}>
        <Clip shot={s} dur={SHOT + 8} grade={st.grade} />
        <Kinetic shot={s} st={st} />
      </Sequence>
    ))}
    <Sequence from={shots.length * SHOT} durationInFrames={END}>
      <EndCard brand={brand} line={line} cta={cta} st={st} bg={endBg} />
    </Sequence>
  </AbsoluteFill>
);

// Цветокоррекция: шторка «до / после» проходит по кадру
export const GradeDemo: React.FC<{ src: string; from: number }> = ({ src, from }) => {
  const f = useCurrentFrame();
  const { durationInFrames, width } = useVideoConfig();
  const x = interpolate(f, [20, 90, 130, 180, durationInFrames - 20], [0.08, 0.92, 0.92, 0.5, 0.5], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const vid = (filter: string) => (
    <AbsoluteFill style={{ filter }}>
      <Video src={staticFile(`clips/${src}`)} trimBefore={Math.round(from * 30)} muted objectFit="cover" style={{ width: "100%", height: "100%" }} />
    </AbsoluteFill>
  );
  const label = (t: string, left: boolean) => (
    <div style={{ position: "absolute", top: 150, [left ? "left" : "right"]: 50, fontFamily: "Golos Text", fontWeight: 700, fontSize: 36, letterSpacing: 4, color: "#fff", background: "rgba(0,0,0,.45)", padding: "14px 26px", borderRadius: 999 }}>{t}</div>
  );
  const t = interpolate(f, [0, 15], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {vid("saturate(1.35) contrast(1.12) brightness(1.02) sepia(.12) hue-rotate(-6deg)")}
      <AbsoluteFill style={{ clipPath: `inset(0 ${(1 - x) * 100}% 0 0)` }}>{vid("saturate(.45) contrast(.78) brightness(1.1)")}</AbsoluteFill>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: x * width - 3, width: 6, background: "#fff", boxShadow: "0 0 30px rgba(0,0,0,.5)" }} />
      <div style={{ position: "absolute", top: "50%", left: x * width - 45, width: 90, height: 90, marginTop: -45, borderRadius: "50%", background: "#fff", display: "grid", placeItems: "center", fontSize: 40, fontWeight: 700, color: "#111", fontFamily: "Golos Text" }}>⇆</div>
      {label("ДО", true)}
      {label("ПОСЛЕ", false)}
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 70px 200px", opacity: t }}>
        <div style={{ fontFamily: "Golos Text", fontWeight: 700, fontSize: 34, letterSpacing: 6, color: "#ffd27a", textTransform: "uppercase" }}>Обработка видео</div>
        <div style={{ fontFamily: "Literata", fontWeight: 600, fontSize: 96, lineHeight: 1.05, color: "#fff", marginTop: 18, textShadow: "0 4px 30px rgba(0,0,0,.4)" }}>Цветокоррекция и стилизация</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
