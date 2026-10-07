// Заставки уроков курса Росмолодёжи: V1 — утверждённый стиль (цветная шторка), V2 — по брендбуку («окна возможностей»)
import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/fonts";
import "./Portfolio"; // Golos Text для V1

loadFont({ family: "Rosmol Sans", url: staticFile("rm/RosmolBold.otf"), weight: "700" });
loadFont({ family: "Rosmol Sans", url: staticFile("rm/RosmolMedium.otf"), weight: "500" });
loadFont({ family: "ALS Granate", url: staticFile("rm/GranateReg.otf"), weight: "400" });
loadFont({ family: "ALS Granate", url: staticFile("rm/GranateBold.otf"), weight: "700" });

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const COURSE_FULL = "Проектирование, организация и проведение молодежных мероприятий, проектов и программ";
export const ALL = [
  { n: 1, title: "Как пройти курс с пользой для своей работы" },
  { n: 2, title: "Зачем нужны молодежные мероприятия" },
  { n: 3, title: "Молодежь как целевая аудитория" },
  { n: 4, title: "Результат и путь участника" },
  { n: 6, title: "Заказчик, задача и концепция" },
  { n: 7, title: "Региональная специфика" },
  { n: 9, title: "Принципы содержательной программы" },
  { n: 12, title: "Команда, партнеры и эксперты" },
  { n: 13, title: "Среда реализации, безопасность и специальные условия участия" },
  { n: 0, title: "Практический разбор эталонного примера мероприятия с экспертными комментариями" },
];
export const RM_DUR = 120;
type L = { n: number; title: string; idx: number };
const num = (n: number) => (n ? String(n).padStart(2, "0") : "+");
const label = (n: number) => (n ? "Урок" : "Дополнительный урок");

// ---------- V1: стиль, который уже утвердили ----------
const V1C = [
  { accent: "#ffcf4a", bg: "#1f3bd1" }, { accent: "#7ef0c4", bg: "#6b22c7" },
  { accent: "#ff8a5b", bg: "#0f6b5c" }, { accent: "#ffd1ec", bg: "#d6344f" },
];
export const V1: React.FC<{ l: L }> = ({ l }) => {
  const f = useCurrentFrame(); const { fps, durationInFrames: D } = useVideoConfig();
  const c = V1C[l.idx % V1C.length];
  const wipe = interpolate(f, [0, 16], [0, 1], { ...clamp, easing: ease });
  const wipeOut = interpolate(f, [D - 14, D], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const nm = spring({ frame: f - 8, fps, config: { damping: 16, mass: 0.8 } });
  const line = interpolate(f, [18, 40], [0, 1], { ...clamp, easing: ease });
  const words = l.title.split(" ");
  const fs = l.title.length > 60 ? 64 : l.title.length > 36 ? 78 : 92;
  const sub = interpolate(f, [34, 48], [0, 1], { ...clamp, easing: ease });
  const prog = interpolate(f, [40, 70], [l.idx / ALL.length, (l.idx + 1) / ALL.length], { ...clamp, easing: ease });
  const rot = interpolate(f, [0, D], [0, 40]);
  return (
    <AbsoluteFill style={{ background: "#0d0f14", overflow: "hidden" }}>
      <AbsoluteFill style={{ background: c.bg, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 ${wipeOut * 100}%)` }}>
        <div style={{ position: "absolute", right: -220, top: -220, width: 820, height: 820, borderRadius: "50%", border: `3px solid ${c.accent}55`, transform: `rotate(${rot}deg)` }}>
          <div style={{ position: "absolute", left: "50%", top: -14, width: 28, height: 28, borderRadius: "50%", background: c.accent }} />
        </div>
        <div style={{ position: "absolute", right: 90, top: 90, width: 520, height: 520, borderRadius: "50%", background: `${c.accent}18`, transform: `scale(${0.6 + nm * 0.4})` }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", left: 1180 + i * 70, bottom: 170, width: 10, height: 10, borderRadius: 5, background: c.accent, opacity: interpolate(f, [30 + i * 3, 40 + i * 3], [0, 0.9], clamp) }} />
        ))}
        <div style={{ position: "absolute", left: 140, top: 130, fontFamily: "Golos Text", fontWeight: 700, fontSize: 34, letterSpacing: 8, color: c.accent, textTransform: "uppercase", opacity: line }}>{label(l.n)}</div>
        <div style={{ position: "absolute", left: 128, top: 170, fontFamily: "Golos Text", fontWeight: 900, fontSize: 280, lineHeight: 1, color: "#fff", transform: `translateY(${(1 - nm) * 80}px)`, opacity: nm }}>{num(l.n)}</div>
        <div style={{ position: "absolute", left: 140, top: 490, width: 900 * line, height: 6, background: c.accent, borderRadius: 3 }} />
        <div style={{ position: "absolute", left: 140, top: 540, width: 1400, fontFamily: "Golos Text", fontWeight: 800, fontSize: fs, lineHeight: 1.1, color: "#fff", letterSpacing: -1.5 }}>
          {words.map((w, i) => {
            const p = spring({ frame: f - 22 - i * 2, fps, config: { damping: 200 } });
            return <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", marginRight: fs * 0.27, paddingBottom: "0.14em", marginBottom: "-0.14em" }}>
              <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%)` }}>{w}</span></span>;
          })}
        </div>
        <div style={{ position: "absolute", left: 140, right: 140, bottom: 70, opacity: sub }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Golos Text", fontWeight: 600, fontSize: 24, color: "rgba(255,255,255,.75)", marginBottom: 14 }}>
            <span>{COURSE_FULL}</span><span>Онлайн-курс</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.18)" }}>
            <div style={{ height: 8, borderRadius: 4, width: `${prog * 100}%`, background: c.accent }} />
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: interpolate(f, [0, 10], [1, 0], clamp) }}>
        <div style={{ width: 90, height: 90, borderRadius: 24, background: c.accent, transform: `scale(${interpolate(f, [0, 10], [1, 0.6], clamp)})` }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- V2: брендбук Росмолодёжи ----------
const RED = "#FF443B", DARK = "#7B0023", INK = "#2A2A2A";
const SHAPES = ["Vector-5", "Vector-2", "Vector-4", "Vector-1"];
const Win: React.FC<{ s: string; w: number; h: number; style?: React.CSSProperties; bg: string }> = ({ s, w, h, style, bg }) => (
  <div style={{ position: "absolute", width: w, height: h, background: bg, WebkitMaskImage: `url(${staticFile(`rm/${s}.svg`)})`, WebkitMaskSize: "100% 100%", maskImage: `url(${staticFile(`rm/${s}.svg`)})`, maskSize: "100% 100%", ...style }} />
);
const AR: Record<string, number> = { "Vector-5": 1701 / 1604, "Vector-2": 1661 / 1120, "Vector-4": 2126 / 1223, "Vector": 2207 / 1506, "Vector-1": 1550 / 1834 };

export const V2: React.FC<{ l: L }> = ({ l }) => {
  const f = useCurrentFrame(); const { fps, durationInFrames: D } = useVideoConfig();
  const s = SHAPES[l.idx % SHAPES.length], ar = AR[s];
  const inK = spring({ frame: f - 2, fps, config: { damping: 18, stiffness: 90 } });
  const out = interpolate(f, [D - 16, D], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const H = 780, W = H * ar > 1000 ? 1000 : H * ar, HH = W / ar;
  const cx = 1420, cy = 540;
  const wave = (k: number) => interpolate(f, [6 + k * 6, 60 + k * 6], [0.9, 1.25 + k * 0.22], { ...clamp, easing: ease });
  const nm = spring({ frame: f - 16, fps, config: { damping: 14 } });
  const words = l.title.split(" ");
  const fs = l.title.length > 60 ? 64 : l.title.length > 36 ? 76 : 88;
  const meta = interpolate(f, [30, 46], [0, 1], { ...clamp, easing: ease });
  const glow = interpolate(f, [20, 70], [-300, 500], clamp);
  return (
    <AbsoluteFill style={{ background: "#fff", overflow: "hidden" }}>
      {/* волны «окон» от центральной точки */}
      {[2, 1, 0].map(k => (
        <Win key={k} s={s} w={W} h={HH} bg={RED} style={{ left: cx - W / 2, top: cy - HH / 2, opacity: (0.07 + (2 - k) * 0.03) * inK * (1 - out),
          transform: `scale(${wave(k) * (1 + out * 0.4)}) rotate(${-6 + k * 4}deg)` }} />
      ))}
      {/* главное окно */}
      <div style={{ position: "absolute", left: cx - W / 2, top: cy - HH / 2, width: W, height: HH,
        transform: `translateX(${(1 - inK) * 700 + out * 900}px) rotate(${(1 - inK) * 12}deg)` }}>
        <Win s={s} w={W} h={HH} bg={`linear-gradient(135deg, ${RED} 10%, ${DARK} 95%)`} style={{ left: 0, top: 0 }} />
        {/* световой блик */}
        <Win s={s} w={W} h={HH} bg={`radial-gradient(circle at ${glow}px 30%, rgba(255,255,255,.45), rgba(255,255,255,0) 280px)`} style={{ left: 0, top: 0 }} />
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: `translateY(-55%) scale(${0.7 + nm * 0.3})`, opacity: nm, textAlign: "center",
          fontFamily: "Rosmol Sans", fontWeight: 700, fontSize: l.n ? 300 : 260, color: "#fff", lineHeight: 1, letterSpacing: -6 }}>{num(l.n)}</div>
      </div>
      {/* текст слева */}
      <div style={{ position: "absolute", left: 120, top: 210, width: 830, opacity: 1 - out, transform: `translateX(${-out * 120}px)` }}>
        <div style={{ display: "inline-block", fontFamily: "ALS Granate", fontWeight: 700, fontSize: 30, letterSpacing: 2, textTransform: "uppercase", color: "#fff", background: INK,
          padding: "8px 18px 6px", transform: `scaleX(${interpolate(f, [10, 24], [0, 1], { ...clamp, easing: ease })})`, transformOrigin: "0 50%" }}>{label(l.n)}{l.n ? ` ${l.n}` : ""}</div>
        <div style={{ marginTop: 34, fontFamily: "Rosmol Sans", fontWeight: 700, fontSize: fs, lineHeight: 1.05, color: INK }}>
          {words.map((w, i) => {
            const p = spring({ frame: f - 18 - i * 2, fps, config: { damping: 200 } });
            return <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", marginRight: fs * 0.25, paddingBottom: "0.12em", marginBottom: "-0.12em" }}>
              <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%)` }}>{w}</span></span>;
          })}
        </div>
      </div>
      {/* курс и навигатор уроков */}
      <div style={{ position: "absolute", left: 120, bottom: 80, width: 820, opacity: meta * (1 - out) }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          {ALL.map((_, i) => <div key={i} style={{ width: 46, height: 12, transform: "skewX(-14deg)", background: i === l.idx ? RED : i < l.idx ? `${RED}66` : "#e6e6e6" }} />)}
        </div>
        <div style={{ fontFamily: "ALS Granate", fontSize: 26, lineHeight: 1.3, color: `${INK}cc` }}>{COURSE_FULL}</div>
      </div>
    </AbsoluteFill>
  );
};

const series = (C: React.FC<{ l: L }>) => () => (
  <AbsoluteFill style={{ background: "#fff" }}>
    {ALL.slice(0, 4).map((x, i) => <Sequence key={i} from={i * RM_DUR} durationInFrames={RM_DUR}><C l={{ ...x, idx: i }} /></Sequence>)}
  </AbsoluteFill>
);
export const RM_V1 = series(V1);
export const RM_V2 = series(V2);
