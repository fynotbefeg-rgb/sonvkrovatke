import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from "remotion";
import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Шрифты лендинга лежат локально в public/fonts (вариативные woff2 с Google Fonts)
const CYRILLIC = "U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116";
const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";

export const serif = "Literata";
export const sans = "Golos Text";
for (const [family, file] of [
  [serif, "literata"],
  [sans, "golos"],
]) {
  loadFont({ family, url: staticFile(`fonts/${file}-cyr.woff2`), weight: "400 600", unicodeRange: CYRILLIC });
  loadFont({ family, url: staticFile(`fonts/${file}-lat.woff2`), weight: "400 600", unicodeRange: LATIN });
}

// Палитра лендинга (index.html :root)
export const C = {
  nightDeep: "#0a141d",
  night: "#101d29",
  nightSoft: "#1a2c3b",
  lamp: "#f2dcbb",
  amber: "#d99a3f",
  morning: "#faf6ef",
  mute: "#6f8494",
};

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Появление снизу с затуханием
export const Rise: React.FC<{
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
export const Scene: React.FC<{ duration: number; children: React.ReactNode }> = ({
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

export const Background: React.FC = () => {
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

export const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
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

export const Title: React.FC<{ children: React.ReactNode; size?: number }> = ({
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

