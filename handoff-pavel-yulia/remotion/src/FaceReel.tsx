import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import WORDS from "./faceWords.json";
import CUTS from "./faceCuts.json";

const FPS = 30;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const GPT = "#10a37f";
const CL = "#d97757";
const FONT = "Golos Text";

type W = [string, number, number];
type Ins =
  | { kind: "video"; from: number; to: number; src: string; trim?: number; rate?: number; badge?: string; badgeColor?: string }
  | { kind: "split"; from: number; to: number; a: string; b: string; trim?: number; rate?: number }
  | { kind: "vs" | "timers" | "cta"; from: number; to: number };

export type Version = { hook: "h1" | "h2" | "h3"; hookDur: number; plate: string; hookIns: Ins[] };
const BODY_DUR = 57.62;

const BODY_INS: Ins[] = [
  { kind: "video", from: 2.4, to: 12.3, src: "maps.mp4", trim: 0, rate: 1.8 },
  { kind: "vs", from: 12.35, to: 16.4 },
  { kind: "video", from: 16.45, to: 21.9, src: "prompt.mp4", trim: 0 },
  { kind: "video", from: 24.0, to: 28.7, src: "gptdone.mp4", trim: 2, badge: "⏱ 10:59", badgeColor: GPT },
  { kind: "video", from: 28.8, to: 34.2, src: "cldone.mp4", trim: 2, badge: "⏱ 18:06", badgeColor: CL },
  { kind: "video", from: 34.3, to: 38.6, src: "cl-mob.mp4", trim: 4 },
  { kind: "video", from: 38.65, to: 43.4, src: "cl-desk.mp4", trim: 1 },
  { kind: "video", from: 43.5, to: 46.3, src: "gpt-mob.mp4", trim: 0 },
  { kind: "split", from: 46.4, to: 53.0, a: "gpt-mob.mp4", b: "cl-mob.mp4", trim: 0, rate: 0.8 },
  { kind: "cta", from: 53.1, to: BODY_DUR },
];

const Logo: React.FC<{ who: "gpt" | "cl"; size: number }> = ({ who, size }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: who === "gpt" ? GPT : CL, display: "grid", placeItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
    <Img src={staticFile(`face/${who === "gpt" ? "openai" : "claude"}-w.svg`)} style={{ width: size * 0.62, height: size * 0.62 }} />
  </div>
);

const Card: React.FC<{ p: number; tall?: boolean; children: React.ReactNode }> = ({ p, tall, children }) => (
  <div style={{ position: "absolute", left: 50, right: 150, top: 420, height: 420, borderRadius: 30, overflow: "hidden", background: "#111", opacity: p }}>
    {children}
  </div>
);

const Insert: React.FC<{ ins: Ins; p: number }> = ({ ins, p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (ins.kind === "video") {
    const b = spring({ frame: f - 10, fps, config: { damping: 12 } });
    return (
      <Card p={p}>
        <OffthreadVideo src={staticFile(`face/${ins.src}`)} muted trimBefore={Math.round((ins.trim ?? 0) * FPS)} playbackRate={ins.rate ?? 1} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
        {ins.badge && (
          <div style={{ position: "absolute", right: 30, bottom: 30, background: ins.badgeColor, color: "#fff", fontFamily: FONT, fontWeight: 900, fontSize: 60, padding: "10px 26px", borderRadius: 20, transform: `scale(${b})`, boxShadow: "0 12px 30px rgba(0,0,0,.4)" }}>{ins.badge}</div>
        )}
      </Card>
    );
  }
  if (ins.kind === "split") {
    const half = (src: string, who: "gpt" | "cl") => (
      <div style={{ position: "relative", flex: 1, overflow: "hidden", borderRadius: 28 }}>
        <OffthreadVideo src={staticFile(`face/${src}`)} muted trimBefore={Math.round((ins.trim ?? 0) * FPS)} playbackRate={ins.rate ?? 1} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left top" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "18px 0", background: who === "gpt" ? GPT : CL, color: "#fff", fontFamily: FONT, fontWeight: 900, fontSize: 34, textAlign: "center" }}>{who === "gpt" ? "ChatGPT" : "Claude"}</div>
      </div>
    );
    return (
      <Card p={p} tall>
        <div style={{ display: "flex", gap: 14, width: "100%", height: "100%", background: "#fff", padding: 14 }}>{half(ins.a, "gpt")}{half(ins.b, "cl")}</div>
      </Card>
    );
  }
  if (ins.kind === "vs" || ins.kind === "timers") {
    const a = spring({ frame: f - 2, fps, config: { damping: 11 } });
    const b = spring({ frame: f - 8, fps, config: { damping: 11 } });
    const v = spring({ frame: f - 14, fps, config: { damping: 9 } });
    const col = (who: "gpt" | "cl", s: number, top: string, bottom: string) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, transform: `scale(${s})` }}>
        <Logo who={who} size={150} />
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: ins.kind === "timers" ? 66 : 46, color: "#111" }}>{top}</div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, color: "#fff", background: who === "gpt" ? GPT : CL, padding: "8px 26px", borderRadius: 999 }}>{bottom}</div>
      </div>
    );
    return (
      <Card p={p}>
        <AbsoluteFill style={{ background: "#f4f1ea", flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
          {ins.kind === "vs" ? col("gpt", a, "ChatGPT", "Astra 6") : col("gpt", a, "11 мин", "ChatGPT")}
          <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 64, color: "#111", transform: `scale(${v})` }}>{ins.kind === "vs" ? "VS" : "⚡"}</div>
          {ins.kind === "vs" ? col("cl", b, "Claude", "Fable 5.1") : col("cl", b, "18 мин", "Claude")}
        </AbsoluteFill>
      </Card>
    );
  }
  // cta
  const s = spring({ frame: f - 3, fps, config: { damping: 10 } });
  const pulse = 1 + Math.sin(f / 5) * 0.03;
  return (
    <Card p={p}>
      <AbsoluteFill style={{ background: "#111", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 12 }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 38, color: "rgba(255,255,255,.8)" }}>Хочешь мой промпт?</div>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 50, color: "#fff" }}>Напиши в комментах</div>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 104, color: "#111", background: "#ffd400", padding: "2px 40px", borderRadius: 30, transform: `scale(${s * pulse})` }}>САЙТ</div>
        <div style={{ fontSize: 56, transform: `translateY(${Math.sin(f / 4) * 10}px)` }}>👇</div>
      </AbsoluteFill>
    </Card>
  );
};

const winP = (t: number, a: number, b: number) =>
  interpolate(t, [a, a + 0.25, b - 0.2, b], [0, 1, 1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) });

const Captions: React.FC<{ words: W[]; t: number; y: number }> = ({ words, t, y }) => {
  const { fps } = useVideoConfig();
  let i = -1;
  for (let k = 0; k < words.length; k++) if (words[k][1] <= t + 0.03) i = k;
  if (i < 0) return null;
  const [w, s] = words[i];
  const nextS = i + 1 < words.length ? words[i + 1][1] : s + 0.8;
  if (t > Math.max(nextS, s + 0.4) + 0.6) return null;
  const pop = spring({ frame: Math.round((t - s) * fps), fps, config: { damping: 12, stiffness: 220 } });
  const color = /ChatGPT|Astra/.test(w) ? "#3fe0b0" : /Claude|Fable/.test(w) ? "#ffab85" : /\d/.test(w) ? "#ffd400" : "#fff";
  const icon = /ChatGPT/.test(w) ? "gpt" : /Claude/.test(w) ? "cl" : null;
  return (
    <div style={{ position: "absolute", left: 0, right: 100, top: y, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16 }}>
      {icon && <div style={{ transform: `scale(${pop})` }}><Logo who={icon as "gpt" | "cl"} size={100} /></div>}
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 92, color, textTransform: "uppercase", letterSpacing: -1, WebkitTextStroke: "14px #000", paintOrder: "stroke fill", textShadow: "0 8px 20px rgba(0,0,0,.5)", transform: `scale(${0.7 + pop * 0.3})` }}>{w}</div>
    </div>
  );
};

export const FaceReel: React.FC<Version> = ({ hook, hookDur, plate, hookIns }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const inBody = t >= hookDur;
  const lt = inBody ? t - hookDur : t;
  const ins = inBody ? BODY_INS : hookIns;
  const words = (WORDS as unknown as Record<string, W[]>)[inBody ? "body" : hook];
  // вставки в общем времени, соседние (пауза < 3 с) склеены в группы — лицо не прыгает
  const list = [...hookIns.map((x) => ({ x, a: x.from, b: x.to })), ...BODY_INS.map((x) => ({ x, a: x.from + hookDur, b: x.to + hookDur }))].sort((m, n) => m.a - n.a);
  list[0].a = 0;
  for (let i = 0; i + 1 < list.length; i++) if (list[i + 1].a - list[i].b < 3) list[i].b = list[i + 1].a + 0.25;
  const groups: number[][] = [];
  for (const { a, b } of list) {
    const g = groups[groups.length - 1];
    if (g && a - g[1] < 3) g[1] = Math.max(g[1], b);
    else groups.push([a, b]);
  }
  let p = 0;
  for (const [a, b] of groups) p = Math.max(p, interpolate(t, [a, a + 0.45, b - 0.35, b], [0, 1, 1, 0], { ...clamp, easing: Easing.inOut(Easing.cubic) }));
  const capY = 868;
  // лёгкий наезд на склейках, не чаще раза в 1,2 с
  const cutsAll = [...(CUTS as Record<string, number[]>)[hook], hookDur, ...(CUTS as Record<string, number[]>).body.map((c) => c + hookDur)];
  let zoomOn = false;
  let last = -9;
  for (const c of cutsAll) {
    if (c > t) break;
    if (c - last >= 1.2) { zoomOn = !zoomOn; last = c; }
  }
  const zoom = zoomOn ? 1.08 : 1;
  const hookFrames = Math.round(hookDur * FPS);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#141922 0%,#1d2531 100%)" }}>
      {/* лицо */}
      <div style={{ position: "absolute", left: 0, top: 860, width: 1080, height: 1060, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: -370, width: 1080, height: 1920, transform: `scale(${zoom})`, transformOrigin: "50% 36%" }}>
          <Sequence durationInFrames={hookFrames}>
            <OffthreadVideo src={staticFile(`face/${hook}.mp4`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
          <Sequence from={hookFrames}>
            <OffthreadVideo src={staticFile("face/body2.mp4")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 850, height: 30, background: "linear-gradient(180deg,#1d2531,#1d253100)" }} />
      {/* подложка карточки — держится всю группу */}
      <div style={{ position: "absolute", left: 50, right: 150, top: 420, height: 420, borderRadius: 30, background: "#0b0e13" }} />
      {/* вставки */}
      {list.map(({ x, a, b }, i) => (
        <Sequence key={i} from={Math.round(a * FPS)} durationInFrames={Math.max(1, Math.round((b - a) * FPS))}>
          <Insert ins={x} p={interpolate(t, [a, a + 0.25, b - 0.25, b], [0, 1, 1, 0], clamp)} />
        </Sequence>
      ))}
      {/* плашка-хук */}
      <div style={{ position: "absolute", left: 70, right: 150, top: 230, background: "#fff", borderRadius: 34, padding: "22px 30px", textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 52, lineHeight: 1.12, color: "#111", boxShadow: "0 14px 40px rgba(0,0,0,.18)" }}>
        {plate}
      </div>
      <Captions words={words} t={lt} y={capY} />
    </AbsoluteFill>
  );
};

export const VERSIONS: Record<string, Version> = {
  v1: {
    hook: "h1", hookDur: 8.9, plate: "ChatGPT vs Claude: кто быстрее сделает сайт? 😳",
    hookIns: [{ kind: "vs", from: 1.6, to: 5.7 }, { kind: "timers", from: 6.6, to: 8.9 }],
  },
  v2: {
    hook: "h2", hookDur: 6.9, plate: "Нейросети сделали сайт барбершопу 🤯",
    hookIns: [{ kind: "video", from: 0.0, to: 3.5, src: "maps.mp4", trim: 11 }, { kind: "vs", from: 4.0, to: 6.9 }],
  },
  v3: {
    hook: "h3", hookDur: 5.1, plate: "1 промпт — 2 сайта. Кто победит? 🔥",
    hookIns: [{ kind: "vs", from: 0.0, to: 2.0 }, { kind: "split", from: 3.0, to: 5.1, a: "gpt-desk.mp4", b: "cl-desk.mp4", trim: 0 }],
  },
};
export const reelFrames = (v: Version) => Math.round((v.hookDur + BODY_DUR) * FPS);
