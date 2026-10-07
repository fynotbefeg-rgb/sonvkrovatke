import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const G = "Golos Text";
const L = "Literata";

const Bg: React.FC<{ src: string; dur: number; from?: number; filter?: string; zoom?: [number, number] }> = ({ src, dur, from = 0, filter = "", zoom = [1.08, 1] }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: interpolate(f, [0, 8], [0, 1], clamp) }}>
      <AbsoluteFill style={{ transform: `scale(${interpolate(f, [0, dur], zoom)})`, filter }}>
        <Video src={staticFile(`clips/${src}`)} trimBefore={Math.round(from * 30)} muted objectFit="cover" style={{ width: "100%", height: "100%" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Pop: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, children, style }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 12, stiffness: 160 } });
  return <div style={{ transform: `scale(${p})`, opacity: Math.min(1, p * 1.5), ...style }}>{children}</div>;
};

/* ---------- 1. Рекламный креатив товара, 9:16 ---------- */
const PEACH = "#ffb08a";
const Progress: React.FC = () => {
  const f = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: "absolute", top: 60, left: 40, right: 40, height: 8, borderRadius: 4, background: "rgba(255,255,255,.35)" }}>
      <div style={{ width: `${(f / durationInFrames) * 100}%`, height: "100%", borderRadius: 4, background: "#fff" }} />
    </div>
  );
};

export const AdCreative: React.FC = () => {
  const f = useCurrentFrame();
  const pulse = 1 + 0.04 * Math.sin(f / 4);
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: G }}>
      {/* Хук */}
      <Sequence durationInFrames={66}>
        <Bg src="sk2.mp4" dur={66} from={1} filter="saturate(1.1) brightness(1.05)" />
        <AbsoluteFill style={{ background: "linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 45%)" }} />
        <AbsoluteFill style={{ padding: "150px 70px 0" }}>
          <Pop><div style={{ display: "inline-block", background: PEACH, color: "#2b140a", fontWeight: 800, fontSize: 38, padding: "12px 24px", borderRadius: 14 }}>GLOW C · сыворотка</div></Pop>
          <Pop delay={6} style={{ marginTop: 30 }}><div style={{ color: "#fff", fontWeight: 900, fontSize: 118, lineHeight: 1, textTransform: "uppercase", textShadow: "0 6px 30px rgba(0,0,0,.4)" }}>Кожа сияет через 7&nbsp;дней</div></Pop>
        </AbsoluteFill>
      </Sequence>
      {/* Преимущества */}
      <Sequence from={60} durationInFrames={96}>
        <Bg src="sk1.mp4" dur={96} from={2} filter="saturate(1.1)" />
        <AbsoluteFill style={{ background: "linear-gradient(90deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 70%)" }} />
        <AbsoluteFill style={{ justifyContent: "center", padding: "0 60px", gap: 26 }}>
          {["Витамин C 15%", "Без отдушек и спирта", "Для чувствительной кожи"].map((t, i) => (
            <Pop key={t} delay={8 + i * 14}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 22, background: "rgba(255,255,255,.94)", borderRadius: 24, padding: "26px 34px", fontSize: 52, fontWeight: 700, color: "#1b1b1b" }}>
                <span style={{ width: 58, height: 58, borderRadius: "50%", background: PEACH, display: "grid", placeItems: "center", fontSize: 36 }}>✓</span>{t}
              </div>
            </Pop>
          ))}
        </AbsoluteFill>
      </Sequence>
      {/* Цена */}
      <Sequence from={150} durationInFrames={81}>
        <Bg src="sk3.mp4" dur={81} from={2} filter="saturate(1.05) brightness(1.05)" />
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300 }}>
          <Pop delay={4}>
            <div style={{ background: "#fff", borderRadius: 40, padding: "46px 70px", textAlign: "center", position: "relative", boxShadow: "0 30px 80px rgba(0,0,0,.35)" }}>
              <div style={{ position: "absolute", top: -50, right: -40, background: "#ff3d5a", color: "#fff", fontWeight: 900, fontSize: 56, width: 150, height: 150, borderRadius: "50%", display: "grid", placeItems: "center", transform: "rotate(12deg)" }}>−24%</div>
              <div style={{ fontSize: 50, color: "#999", textDecoration: "line-through" }}>1 690 ₽</div>
              <div style={{ fontSize: 140, fontWeight: 900, color: "#1b1b1b", lineHeight: 1 }}>1 290 ₽</div>
              <div style={{ fontSize: 38, color: "#666", marginTop: 12 }}>только до конца недели</div>
            </div>
          </Pop>
        </AbsoluteFill>
      </Sequence>
      {/* CTA */}
      <Sequence from={225} durationInFrames={75}>
        <Bg src="sk4.mp4" dur={75} from={1} filter="blur(6px) brightness(.55)" zoom={[1.15, 1.1]} />
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "0 70px" }}>
          <Pop><div style={{ color: "#fff", fontWeight: 900, fontSize: 100, lineHeight: 1.02, textTransform: "uppercase" }}>Попробуйте GLOW C</div></Pop>
          <Pop delay={10} style={{ marginTop: 70 }}>
            <div style={{ transform: `scale(${pulse})`, background: PEACH, color: "#2b140a", fontWeight: 800, fontSize: 56, padding: "34px 70px", borderRadius: 999 }}>Заказать со скидкой →</div>
          </Pop>
          <Pop delay={18} style={{ marginTop: 40 }}><div style={{ color: "rgba(255,255,255,.85)", fontSize: 40 }}>Доставка за 1 день</div></Pop>
        </AbsoluteFill>
      </Sequence>
      <Progress />
    </AbsoluteFill>
  );
};

/* ---------- 2. Видео-тур квартиры, 16:9 ---------- */
const ACC = "#c9a46a";
const LowerThird: React.FC<{ idx: string; room: string; area: string; note: string }> = ({ idx, room, area, note }) => {
  const f = useCurrentFrame();
  const p = interpolate(f, [8, 26], [0, 1], { ...clamp, easing: ease });
  const q = interpolate(f, [18, 36], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ position: "absolute", left: 90, bottom: 110, display: "flex", alignItems: "stretch", clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }}>
      <div style={{ width: 8, background: ACC }} />
      <div style={{ background: "rgba(255,255,255,.95)", padding: "26px 40px 28px 34px" }}>
        <div style={{ fontFamily: G, fontSize: 22, letterSpacing: 4, color: "#8a7a62", fontWeight: 700 }}>{idx}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 6 }}>
          <div style={{ fontFamily: L, fontSize: 64, fontWeight: 600, color: "#1d1b18" }}>{room}</div>
          <div style={{ fontFamily: G, fontSize: 44, fontWeight: 700, color: ACC }}>{area}</div>
        </div>
        <div style={{ fontFamily: G, fontSize: 28, color: "#6b645a", marginTop: 6, opacity: q }}>{note}</div>
      </div>
    </div>
  );
};
const Logo: React.FC = () => (
  <div style={{ position: "absolute", top: 60, right: 80, fontFamily: G, fontWeight: 800, fontSize: 30, letterSpacing: 6, color: "#fff", background: "rgba(20,18,16,.55)", padding: "12px 22px", borderRadius: 10 }}>КЛЮЧ<span style={{ color: ACC }}>·</span>НЕДВИЖИМОСТЬ</div>
);

export const ApartmentTour: React.FC = () => {
  const rooms = [
    { src: "ap1.mp4", from: 0.5, idx: "01 / 03", room: "Гостиная", area: "24 м²", note: "Большие окна, выход на лоджию" },
    { src: "ap2.mp4", from: 1, idx: "02 / 03", room: "Кухня", area: "14 м²", note: "Встроенная техника остаётся" },
    { src: "ap3.mp4", from: 1, idx: "03 / 03", room: "Спальня", area: "16 м²", note: "Тихая сторона, окна во двор" },
  ];
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <Sequence durationInFrames={75}>
        <Intro />
      </Sequence>
      {rooms.map((r, i) => (
        <Sequence key={r.room} from={70 + i * 95} durationInFrames={100}>
          <Bg src={r.src} dur={100} from={r.from} filter="saturate(1.08) contrast(1.05)" zoom={[1.02, 1.08]} />
          <AbsoluteFill style={{ background: "linear-gradient(0deg,rgba(0,0,0,.35) 0%,rgba(0,0,0,0) 40%)" }} />
          <LowerThird {...r} />
        </Sequence>
      ))}
      <Sequence from={355} durationInFrames={95}>
        <Outro />
      </Sequence>
      <Logo />
    </AbsoluteFill>
  );
};

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const a = interpolate(f, [6, 28], [0, 1], { ...clamp, easing: ease });
  const b = interpolate(f, [18, 40], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Bg src="ap4.mp4" dur={75} from={1} filter="brightness(.6)" />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ fontFamily: G, fontSize: 30, letterSpacing: 8, color: ACC, fontWeight: 700, opacity: a }}>ПРОДАЖА · ЖК «СЕВЕРНЫЙ»</div>
        <div style={{ fontFamily: L, fontSize: 110, fontWeight: 600, color: "#fff", marginTop: 20, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>2-комнатная, 64 м²</div>
        <div style={{ width: 160 * b, height: 3, background: ACC, margin: "34px 0" }} />
        <div style={{ fontFamily: G, fontSize: 38, color: "rgba(255,255,255,.85)", opacity: b }}>12 этаж · вид на город · свежий ремонт</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const a = interpolate(f, [6, 28], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill>
      <Bg src="ap5.mp4" dur={95} from={1} filter="brightness(.45) blur(3px)" />
      <AbsoluteFill style={{ background: "linear-gradient(90deg,rgba(15,13,11,.85) 0%,rgba(15,13,11,.5) 55%,rgba(15,13,11,.2) 100%)" }} />
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 140, opacity: a }}>
        <div style={{ fontFamily: G, fontSize: 30, letterSpacing: 6, color: ACC, fontWeight: 700 }}>ЦЕНА</div>
        <div style={{ fontFamily: L, fontSize: 130, fontWeight: 600, color: "#fff", lineHeight: 1.05, transform: `translateX(${(1 - a) * -40}px)` }}>12 900 000 ₽</div>
        <div style={{ fontFamily: G, fontSize: 40, color: "rgba(255,255,255,.85)", marginTop: 20 }}>Показ в удобное время — звоните</div>
        <div style={{ fontFamily: G, fontSize: 56, fontWeight: 800, color: "#fff", marginTop: 40, display: "inline-flex", alignSelf: "flex-start", background: ACC, padding: "18px 40px", borderRadius: 12 }}>+7 (900) 000-00-00</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
