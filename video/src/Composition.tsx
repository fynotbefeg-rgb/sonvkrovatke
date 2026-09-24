import React from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Шрифты лендинга лежат локально в public/fonts (вариативные woff2 с Google Fonts)
const CYRILLIC = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

const serif = "Literata";
const sans = "Golos Text";
for (const [family, file] of [
  [serif, "literata"],
  [sans, "golos"],
]) {
  loadFont({ family, url: staticFile(`fonts/${file}-cyr.woff2`), weight: "400 600", unicodeRange: CYRILLIC });
  loadFont({ family, url: staticFile(`fonts/${file}-lat.woff2`), weight: "400 600", unicodeRange: LATIN });
}

// Палитра лендинга (index.html :root)
const C = {
  nightDeep: "#0a141d",
  night: "#101d29",
  nightSoft: "#1a2c3b",
  lamp: "#f2dcbb",
  amber: "#d99a3f",
  morning: "#faf6ef",
  mute: "#6f8494",
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Появление снизу с затуханием
const Rise: React.FC<{
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, style }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - delay, [0, 18], [0, 1], { ...clamp, easing: ease });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 40}px)`, ...style }}>
      {children}
    </div>
  );
};

// Затухание сцены на входе и выходе
const Scene: React.FC<{ duration: number; children: React.ReactNode }> = ({
  duration,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, duration - 10, duration], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        opacity,
        justifyContent: "center",
        padding: "0 110px",
        paddingBottom: 120,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  // Мягко «дышащий» свет ночника
  const glow = 0.55 + 0.1 * Math.sin(frame / 22);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 900px 700px at 78% 18%, rgba(217,154,63,${glow * 0.35}), transparent 70%),
          linear-gradient(180deg, ${C.nightDeep} 0%, ${C.night} 55%, ${C.nightSoft} 100%)`,
      }}
    />
  );
};

const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: sans,
      fontWeight: 500,
      fontSize: 38,
      letterSpacing: 6,
      textTransform: "uppercase",
      color: C.amber,
      marginBottom: 36,
    }}
  >
    {children}
  </div>
);

const Title: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 118,
}) => (
  <div
    style={{
      fontFamily: serif,
      fontWeight: 600,
      fontSize: size,
      lineHeight: 1.12,
      color: C.morning,
    }}
  >
    {children}
  </div>
);

// Сцена 1 — хук
const Hook: React.FC = () => {
  const words = ["Он", "засыпает", "только", "на руках?"];
  return (
    <Scene duration={75}>
      <Rise>
        <Kicker>02:40 · снова не спите</Kicker>
      </Rise>
      <Title size={132}>
        {words.map((w, i) => (
          <Rise key={w} delay={6 + i * 7} style={{ display: "block" }}>
            {w}
          </Rise>
        ))}
      </Title>
    </Scene>
  );
};

// Сцена 2 — вечер по часам
const Timeline: React.FC = () => {
  const rows: [string, string][] = [
    ["20:10", "уснул на руках"],
    ["20:35", "переложила в\u00a0кроватку"],
    ["20:37", "плачет"],
    ["21:20", "снова на руках, поясница"],
    ["02:40", "вы смотрите это одной рукой"],
  ];
  return (
    <Scene duration={150}>
      {rows.map(([t, text], i) => {
        const last = i === rows.length - 1;
        return (
          <Rise key={t + text} delay={4 + i * 24} style={{ display: "flex", gap: 44, marginBottom: 46 }}>
            <div
              style={{
                fontFamily: sans,
                fontWeight: 600,
                fontSize: 54,
                color: C.amber,
                fontVariantNumeric: "tabular-nums",
                minWidth: 170,
              }}
            >
              {t}
            </div>
            <div
              style={{
                fontFamily: last ? serif : sans,
                fontStyle: "normal",
                fontWeight: last ? 600 : 400,
                fontSize: last ? 62 : 56,
                lineHeight: 1.2,
                color: last ? C.morning : C.lamp,
              }}
            >
              {text}
            </div>
          </Rise>
        );
      })}
    </Scene>
  );
};

// Сцена 3 — перелом
const Insight: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hl = spring({ frame: frame - 48, fps, config: { damping: 200 } });
  return (
    <Scene duration={105}>
      <Rise>
        <Title size={96}>Он не перерастёт сам.</Title>
      </Rise>
      <Rise delay={22} style={{ marginTop: 56 }}>
        <div style={{ fontFamily: sans, fontSize: 64, lineHeight: 1.3, color: C.lamp }}>
          Он просто ни разу не пробовал заснуть{" "}
          <span style={{ position: "relative", whiteSpace: "nowrap", color: C.morning, fontWeight: 600 }}>
            <span
              style={{
                position: "absolute",
                left: -8,
                right: -8,
                bottom: -6,
                height: 10,
                background: C.amber,
                opacity: 0.9,
                transform: `scaleX(${hl})`,
                transformOrigin: "left",
                borderRadius: 4,
              }}
            />
            <span style={{ position: "relative" }}>иначе.</span>
          </span>
        </div>
      </Rise>
    </Scene>
  );
};

// Сцена 4 — призыв
const Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 34, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <Scene duration={120}>
      <Rise>
        <Kicker>Бесплатная памятка</Kicker>
      </Rise>
      <Rise delay={6}>
        <Title size={96}>7 движений, чтобы переложить малыша и&nbsp;не&nbsp;разбудить</Title>
      </Rise>
      <div
        style={{
          marginTop: 72,
          alignSelf: "flex-start",
          transform: `scale(${pop})`,
          transformOrigin: "left center",
          background: C.amber,
          color: C.nightDeep,
          fontFamily: sans,
          fontWeight: 600,
          fontSize: 54,
          padding: "30px 56px",
          borderRadius: 999,
        }}
      >
        Ссылка в профиле
      </div>
      <Rise delay={44} style={{ marginTop: 40 }}>
        <div style={{ fontFamily: sans, fontSize: 44, color: C.mute }}>
          Попробуйте сегодня вечером, на&nbsp;любом сне
        </div>
      </Rise>
    </Scene>
  );
};

export const SleepReel: React.FC = () => (
  <AbsoluteFill>
    <Background />
    <Sequence durationInFrames={75}>
      <Hook />
    </Sequence>
    <Sequence from={75} durationInFrames={150}>
      <Timeline />
    </Sequence>
    <Sequence from={225} durationInFrames={105}>
      <Insight />
    </Sequence>
    <Sequence from={330} durationInFrames={120}>
      <Cta />
    </Sequence>
  </AbsoluteFill>
);
