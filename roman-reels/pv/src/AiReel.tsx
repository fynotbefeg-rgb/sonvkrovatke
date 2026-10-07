import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import "./Portfolio"; // шрифты Golos Text
import WORDS from "./aiWords1.json";

// Рилсы Романа на аватаре HeyGen: стиль FaceReel (плашка-хук, карточка вставок, лицо снизу, субтитры по слову)
const FPS = 30;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CL = "#d97757";
const GPT = "#10a37f";
const FONT = "Golos Text";

type W = [string, number, number];
type Chan = { at: number; icon: string; label: string; bg: string };
// pan: [время в ролике записи, верх окна в px записи шириной 1080]
type Ins =
  | { kind: "phone"; from: number; to: number; src: string; trim: number; rate?: number; pan: [number, number][]; full?: [number, number, number][] }
  | { kind: "channels"; from: number; to: number; items: Chan[] }
  | { kind: "big"; from: number; to: number; top: string; big: string; bottom?: string }
  | { kind: "cta"; from: number; to: number };

export type AiVersion = { hook: "h1" | "h2" | "h3"; hookDur: number; plate: string; hookIns: Ins[]; hookCuts: number[]; fullBody?: boolean };

const MAIL: Omit<Chan, "at"> = { icon: "✉️", label: "Почта", bg: "#3b82f6" };
const TG: Omit<Chan, "at"> = { icon: "✈️", label: "Telegram", bg: "#2aabee" };
const WA: Omit<Chan, "at"> = { icon: "📞", label: "WhatsApp", bg: "#25d366" };
const MSG: Omit<Chan, "at"> = { icon: "💬", label: "Мессенджеры", bg: "#2aabee" };
const SITE: Omit<Chan, "at"> = { icon: "🌐", label: "Сайт", bg: "#8b5cf6" };
const COMM: Omit<Chan, "at"> = { icon: "🗨️", label: "Комментарии", bg: "#f59e0b" };

// окна панорамы для записей экрана (время записи, px)
const PAN_S3: [number, number][] = [[0, 360], [2.9, 360], [3.3, 230], [7.2, 230], [10.5, 640]];
const PAN_S4: [number, number][] = [[0, 450], [2.9, 450], [3.3, 380], [4.6, 380], [5.8, 880]];
const PAN_S2: [number, number][] = [[0, 360], [2.9, 360], [3.3, 230], [6.6, 230], [8.6, 660]];

// режим «контент на весь экран»: [время записи, точка фокуса по Y в px записи, масштаб]
const FULL_S4: [number, number, number][] = [[0, 980, 1.0], [2.6, 980, 1.05], [3.3, 820, 1.1], [4.4, 820, 1.1], [5.6, 1300, 1.1]];
const FULL_S2: [number, number, number][] = [[0, 900, 1.0], [2.6, 900, 1.05], [3.3, 820, 1.1], [5.6, 820, 1.1], [7.0, 1100, 1.1], [9.0, 1350, 1.1]];

const BODY_DUR = 33.72;
const BODY_CUTS = [6.32, 8.66, 9.7, 17.26, 19.3, 22.0, 27.28, 31.3];
const BODY_INS: Ins[] = [
  { kind: "channels", from: 1.7, to: 6.25, items: [{ ...MAIL, at: 2.0 }, { ...TG, at: 2.62 }, { ...WA, at: 3.6 }, { ...SITE, label: "Чат на сайте", at: 4.38 }, { ...COMM, at: 5.28 }] },
  { kind: "big", from: 6.4, to: 8.6, top: "на ответы уходит", big: "½ ДНЯ", bottom: "каждый день" },
  { kind: "phone", from: 9.6, to: 21.75, src: "s4.mp4", trim: 0.3, rate: 0.7, pan: PAN_S4 },
  { kind: "phone", from: 21.85, to: 27.2, src: "s2.mp4", trim: 2.5, rate: 1.6, pan: PAN_S2 },
  { kind: "cta", from: 27.3, to: BODY_DUR },
];
const BODY_INS_FULL: Ins[] = BODY_INS.map((x) => x.kind !== "phone" ? x : { ...x, full: x.src === "s4.mp4" ? FULL_S4 : FULL_S2 });

const Logo: React.FC<{ who: "gpt" | "cl"; size: number }> = ({ who, size }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: who === "gpt" ? GPT : CL, display: "grid", placeItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
    <Img src={staticFile(`ai/${who === "gpt" ? "openai" : "claude"}-w.svg`)} style={{ width: size * 0.62, height: size * 0.62 }} />
  </div>
);

const Card: React.FC<{ p: number; children: React.ReactNode }> = ({ p, children }) => (
  <div style={{ position: "absolute", left: 50, right: 150, top: 420, height: 420, borderRadius: 30, overflow: "hidden", background: "#111", opacity: p }}>{children}</div>
);

const Insert: React.FC<{ ins: Ins; p: number }> = ({ ins, p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lt = f / fps;
  if (ins.kind === "phone") {
    const rate = ins.rate ?? 1;
    const vt = ins.trim + lt * rate;
    const top = interpolate(vt, ins.pan.map((x) => x[0]), ins.pan.map((x) => x[1]), { ...clamp, easing: Easing.inOut(Easing.cubic) });
    if (ins.full) {
      const k = ins.full;
      const ease = { ...clamp, easing: Easing.inOut(Easing.cubic) };
      const fy = interpolate(vt, k.map((x) => x[0]), k.map((x) => x[1]), ease);
      const sc = interpolate(vt, k.map((x) => x[0]), k.map((x) => x[2]), ease);
      // точка фокуса записи держится на высоте 760 px кадра
      return (
        <AbsoluteFill style={{ background: "#1f1e1d", opacity: p, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 2340, transformOrigin: `540px ${fy}px`, transform: `translate(0px, ${760 - fy}px) scale(${sc})` }}>
            <OffthreadVideo src={staticFile(`ai/${ins.src}`)} muted trimBefore={Math.round(ins.trim * FPS)} playbackRate={rate} style={{ width: 1080, height: 2340 }} />
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 700, background: "linear-gradient(180deg, rgba(20,20,20,0) 0%, rgba(20,20,20,.85) 55%)" }} />
        </AbsoluteFill>
      );
    }
    // запись экрана во всю ширину, окно 780 px
    return (
      <div style={{ position: "absolute", left: 0, right: 0, top: 60, height: 780, overflow: "hidden", background: "#1f1e1d", opacity: p, boxShadow: "0 20px 50px rgba(0,0,0,.45)" }}>
        <div style={{ position: "absolute", left: 0, top: -top, width: 1080, height: 2340 }}>
          <OffthreadVideo src={staticFile(`ai/${ins.src}`)} muted trimBefore={Math.round(ins.trim * FPS)} playbackRate={rate} style={{ width: 1080, height: 2340 }} />
        </div>
        <div style={{ position: "absolute", left: 30, bottom: 24, display: "flex", alignItems: "center", gap: 12, background: "rgba(0,0,0,.7)", padding: "8px 18px 8px 8px", borderRadius: 999 }}>
          <Logo who="cl" size={54} />
          <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 34, color: "#fff" }}>Claude</span>
        </div>
      </div>
    );
  }
  if (ins.kind === "channels") {
    return (
      <Card p={p}>
        <AbsoluteFill style={{ background: "#f4f1ea", flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignContent: "center", gap: 16, padding: 20 }}>
          {ins.items.map((c) => {
            const s = spring({ frame: f - Math.round((c.at - ins.from) * fps), fps, config: { damping: 11 } });
            return (
              <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 12, background: c.bg, borderRadius: 22, padding: "10px 22px", transform: `scale(${s})`, opacity: s > 0.02 ? 1 : 0, boxShadow: "0 10px 24px rgba(0,0,0,.18)" }}>
                <span style={{ fontSize: 48 }}>{c.icon}</span>
                <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 44, color: "#fff" }}>{c.label}</span>
              </div>
            );
          })}
        </AbsoluteFill>
      </Card>
    );
  }
  if (ins.kind === "big") {
    const s = spring({ frame: f - 4, fps, config: { damping: 10 } });
    return (
      <Card p={p}>
        <AbsoluteFill style={{ background: "#111", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 8 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 44, color: "rgba(255,255,255,.85)" }}>{ins.top}</div>
          <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 130, color: "#111", background: "#ffd400", padding: "0 40px", borderRadius: 30, transform: `scale(${s})` }}>{ins.big}</div>
          {ins.bottom && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 44, color: "rgba(255,255,255,.85)" }}>{ins.bottom}</div>}
        </AbsoluteFill>
      </Card>
    );
  }
  const s = spring({ frame: f - 3, fps, config: { damping: 10 } });
  const pulse = 1 + Math.sin(f / 5) * 0.03;
  return (
    <Card p={p}>
      <AbsoluteFill style={{ background: "#111", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 14 }}>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 52, color: "#fff" }}>Напиши в комментах</div>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 56, color: "#111", background: "#ffd400", padding: "6px 30px", borderRadius: 26, fontSize: 48, transform: `scale(${s * pulse})` }}>где общаешься<br />с клиентами</div>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 36, color: "rgba(255,255,255,.8)" }}>разберу в следующем видео</div>
        <div style={{ fontSize: 56, transform: `translateY(${Math.sin(f / 4) * 10}px)` }}>👇</div>
      </AbsoluteFill>
    </Card>
  );
};

const Captions: React.FC<{ words: W[]; t: number; y: number }> = ({ words, t, y }) => {
  const { fps } = useVideoConfig();
  let i = -1;
  for (let k = 0; k < words.length; k++) if (words[k][1] <= t + 0.03) i = k;
  if (i < 0) return null;
  const [raw, s] = words[i];
  const w = raw.replace(/[.,!?]+$/, "");
  const nextS = i + 1 < words.length ? words[i + 1][1] : s + 0.8;
  if (t > Math.max(nextS, s + 0.4) + 0.6) return null;
  const pop = spring({ frame: Math.round((t - s) * fps), fps, config: { damping: 12, stiffness: 220 } });
  const color = /Claude/.test(w) ? "#ffab85" : /ChatGPT/.test(w) ? "#3fe0b0" : /\d|½/.test(w) ? "#ffd400" : "#fff";
  const icon = /ChatGPT/.test(w) ? "gpt" : /Claude/.test(w) ? "cl" : null;
  const size = w.length > 12 ? 78 : 92;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16 }}>
      {icon && <div style={{ transform: `scale(${pop})` }}><Logo who={icon as "gpt" | "cl"} size={100} /></div>}
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: size, color, textTransform: "uppercase", letterSpacing: -1, WebkitTextStroke: "14px #000", paintOrder: "stroke fill", textShadow: "0 8px 20px rgba(0,0,0,.5)", transform: `scale(${0.7 + pop * 0.3})`, whiteSpace: "nowrap" }}>{w}</div>
    </div>
  );
};

export const AiReel: React.FC<AiVersion> = ({ hook, hookDur, plate, hookIns, hookCuts, fullBody }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const inBody = t >= hookDur;
  const lt = inBody ? t - hookDur : t;
  const words = (WORDS as unknown as Record<string, W[]>)[inBody ? "body" : hook];
  const bodyIns = fullBody ? BODY_INS_FULL : BODY_INS;
  const list = [...hookIns.map((x) => ({ x, a: x.from, b: x.to })), ...bodyIns.map((x) => ({ x, a: x.from + hookDur, b: x.to + hookDur }))].sort((m, n) => m.a - n.a);
  // соседние вставки с паузой < 1 с перекрываем, чтобы карточка не мигала
  for (let i = 0; i + 1 < list.length; i++) if (list[i + 1].a - list[i].b < 1) list[i].b = list[i + 1].a + 0.25;
  // плашка уходит, пока на экране запись экрана
  let phoneP = 0;
  let fullOn = false;
  for (const { x, a, b } of list) if (x.kind === "phone") {
    phoneP = Math.max(phoneP, interpolate(t, [a - 0.1, a + 0.2, b - 0.2, b + 0.1], [0, 1, 1, 0], clamp));
    if (x.full && t >= a && t < b) fullOn = true;
  }
  // лёгкий наезд на смене фраз
  const cuts = [...hookCuts, hookDur, ...BODY_CUTS.map((c) => c + hookDur)];
  let zoomOn = false;
  for (const c of cuts) {
    if (c > t) break;
    zoomOn = !zoomOn;
  }
  const zoom = zoomOn ? 1.08 : 1;
  const hookFrames = Math.round(hookDur * FPS);
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#141922 0%,#1d2531 100%)" }}>
      <div style={{ position: "absolute", left: 0, top: 860, width: 1080, height: 1060, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: -250, width: 1080, height: 1920, transform: `scale(${zoom})`, transformOrigin: "50% 30%" }}>
          <Sequence durationInFrames={hookFrames}>
            <OffthreadVideo src={staticFile(`ai/${hook}.mp4`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
          <Sequence from={hookFrames}>
            <OffthreadVideo src={staticFile("ai/body1.mp4")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 850, height: 30, background: "linear-gradient(180deg,#1d2531,#1d253100)" }} />
      {list.map(({ x, a, b }, i) => (
        <Sequence key={i} from={Math.round(a * FPS)} durationInFrames={Math.max(1, Math.round((b - a) * FPS))}>
          <Insert ins={x} p={interpolate(t, [a, a + 0.25, b - 0.25, b], [0, 1, 1, 0], clamp)} />
        </Sequence>
      ))}
      <div style={{ position: "absolute", left: 70, right: 150, top: 230, background: "#fff", borderRadius: 34, padding: "22px 30px", textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 52, lineHeight: 1.12, color: "#111", boxShadow: "0 14px 40px rgba(0,0,0,.18)", opacity: 1 - phoneP }}>
        {plate}
      </div>
      <Captions words={words} t={lt} y={fullOn ? 1480 : 868} />
    </AbsoluteFill>
  );
};

export const AI_VERSIONS: Record<string, AiVersion> = {
  t1v1: {
    hook: "h1", hookDur: 6.49, hookCuts: [5.32], plate: "Перестань сам отвечать клиентам 🤯",
    hookIns: [
      { kind: "channels", from: 2.6, to: 5.2, items: [{ ...MAIL, at: 2.9 }, { ...MSG, at: 3.54 }, { ...SITE, at: 4.32 }] },
      { kind: "phone", from: 5.25, to: 6.49, src: "s2.mp4", trim: 5.6, rate: 1.5, pan: PAN_S2 },
    ],
  },
  t1v2: {
    hook: "h2", hookDur: 7.77, hookCuts: [5.56], plate: "Ты теряешь часы на ответы клиентам 😳",
    hookIns: [
      { kind: "channels", from: 2.6, to: 5.45, items: [{ ...MAIL, at: 2.86 }, { ...MSG, at: 3.68 }, { ...COMM, at: 4.36 }] },
      { kind: "big", from: 5.5, to: 7.77, top: "ты теряешь", big: "⏱ ЧАСЫ", bottom: "каждую неделю" },
    ],
  },
  t1v3: {
    hook: "h3", hookDur: 4.76, hookCuts: [3.74], plate: "Нейросеть ответит клиентам за тебя 🔥",
    hookIns: [{ kind: "phone", from: 1.3, to: 4.76, src: "s4.mp4", trim: 4.0, rate: 1.4, pan: PAN_S4 }],
  },
};
AI_VERSIONS.t1full = { ...AI_VERSIONS.t1v1, fullBody: true };
export const aiFrames = (v: AiVersion) => Math.round((v.hookDur + BODY_DUR) * FPS);
