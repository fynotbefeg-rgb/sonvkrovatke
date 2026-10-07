import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);

export type Lesson = { n: number; title: string; sub: string; accent: string; bg: string };
const COURSE = "Графический дизайн с нуля";
const TOTAL = 12;

// Заставка одного урока: цветная шторка, номер, заголовок по словам, прогресс курса
export const LessonIntro: React.FC<{ l: Lesson }> = ({ l }) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D, width } = useVideoConfig();
  const wipe = interpolate(f, [0, 16], [0, 1], { ...clamp, easing: ease });
  const wipeOut = interpolate(f, [D - 14, D], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const num = spring({ frame: f - 8, fps, config: { damping: 16, mass: 0.8 } });
  const line = interpolate(f, [18, 40], [0, 1], { ...clamp, easing: ease });
  const words = l.title.split(" ");
  const sub = interpolate(f, [34, 48], [0, 1], { ...clamp, easing: ease });
  const prog = interpolate(f, [40, 70], [(l.n - 1) / TOTAL, l.n / TOTAL], { ...clamp, easing: ease });
  const rot = interpolate(f, [0, D], [0, 40]);
  return (
    <AbsoluteFill style={{ background: "#0d0f14", overflow: "hidden" }}>
      {/* шторка */}
      <AbsoluteFill style={{ background: l.bg, clipPath: `inset(0 ${(1 - wipe) * 100}% 0 ${wipeOut * 100}%)` }}>
        {/* декоративные фигуры */}
        <div style={{ position: "absolute", right: -220, top: -220, width: 820, height: 820, borderRadius: "50%", border: `3px solid ${l.accent}55`, transform: `rotate(${rot}deg)` }}>
          <div style={{ position: "absolute", left: "50%", top: -14, width: 28, height: 28, borderRadius: "50%", background: l.accent }} />
        </div>
        <div style={{ position: "absolute", right: 90, top: 90, width: 520, height: 520, borderRadius: "50%", background: `${l.accent}18`, transform: `scale(${0.6 + num * 0.4})` }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ position: "absolute", left: 1180 + i * 70, bottom: 150, width: 10, height: 10, borderRadius: 5, background: l.accent, opacity: interpolate(f, [30 + i * 3, 40 + i * 3], [0, 0.9], clamp) }} />
        ))}
        {/* номер урока */}
        <div style={{ position: "absolute", left: 140, top: 150, fontFamily: "Golos Text", fontWeight: 700, fontSize: 34, letterSpacing: 8, color: l.accent, textTransform: "uppercase", opacity: line }}>
          Урок
        </div>
        <div style={{ position: "absolute", left: 128, top: 190, fontFamily: "Golos Text", fontWeight: 900, fontSize: 300, lineHeight: 1, color: "#fff", transform: `translateY(${(1 - num) * 80}px)`, opacity: num }}>
          {String(l.n).padStart(2, "0")}
        </div>
        <div style={{ position: "absolute", left: 140, top: 530, width: 900 * line, height: 6, background: l.accent, borderRadius: 3 }} />
        {/* заголовок */}
        <div style={{ position: "absolute", left: 140, top: 580, width: 1300, fontFamily: "Golos Text", fontWeight: 800, fontSize: 96, lineHeight: 1.08, color: "#fff", letterSpacing: -2 }}>
          {words.map((w, i) => {
            const p = spring({ frame: f - 22 - i * 3, fps, config: { damping: 200 } });
            return (
              <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "top", marginRight: 26, paddingBottom: "0.14em", marginBottom: "-0.14em" }}>
                <span style={{ display: "inline-block", transform: `translateY(${(1 - p) * 110}%)` }}>{w}</span>
              </span>
            );
          })}
        </div>
        <div style={{ position: "absolute", left: 140, top: 820, fontFamily: "Golos Text", fontWeight: 500, fontSize: 40, color: "rgba(255,255,255,.75)", opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>
          {l.sub}
        </div>
        {/* прогресс курса */}
        <div style={{ position: "absolute", left: 140, right: 140, bottom: 70, opacity: sub }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Golos Text", fontWeight: 600, fontSize: 26, color: "rgba(255,255,255,.7)", marginBottom: 14 }}>
            <span>{COURSE}</span>
            <span>{l.n} / {TOTAL}</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.18)" }}>
            <div style={{ height: 8, borderRadius: 4, width: `${prog * 100}%`, background: l.accent }} />
          </div>
        </div>
      </AbsoluteFill>
      {/* логотип курса в начале, до шторки */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: interpolate(f, [0, 10], [1, 0], clamp), pointerEvents: "none" }}>
        <div style={{ width: 90, height: 90, borderRadius: 24, background: l.accent, transform: `scale(${interpolate(f, [0, 10], [1, 0.6], clamp)})` }} />
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, top: 0, width, height: 0 }} />
    </AbsoluteFill>
  );
};

export const LESSONS: Lesson[] = [
  { n: 1, title: "Композиция и сетка", sub: "Как расставить элементы, чтобы глазу было удобно", accent: "#ffcf4a", bg: "#1f3bd1" },
  { n: 2, title: "Цвет в дизайне", sub: "Палитры, контраст и настроение", accent: "#7ef0c4", bg: "#6b22c7" },
  { n: 3, title: "Шрифты и типографика", sub: "Иерархия текста без лишних усилий", accent: "#ff8a5b", bg: "#0f6b5c" },
  { n: 4, title: "Первый макет в Figma", sub: "Собираем баннер от идеи до экспорта", accent: "#ffd1ec", bg: "#d6344f" },
];
export const INTRO = 105;

// Шоурил: все 4 заставки подряд — видно единый стиль серии
export const IntroSeries: React.FC = () => (
  <AbsoluteFill style={{ background: "#0d0f14" }}>
    {LESSONS.map((l, i) => (
      <Sequence key={i} from={i * INTRO} durationInFrames={INTRO}>
        <LessonIntro l={l} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
