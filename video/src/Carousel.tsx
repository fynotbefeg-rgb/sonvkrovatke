import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, sans, serif } from "./theme";

// Слайды каруселей 1080×1350. Один кадр композиции = один слайд
export type Slide =
  | { kind: "cover"; kicker?: string; title: string; sub?: string }
  | { kind: "text"; kicker?: string; title: string; body?: string }
  | { kind: "step"; num: string; title: string; total: number; index: number }
  | { kind: "final"; kicker?: string; title: string; button: string; note?: string };

export type CarouselProps = { slides: Slide[] };

const Glow: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 760px 620px at 82% 12%, rgba(217,154,63,.2), transparent 70%),
        linear-gradient(180deg, ${C.nightDeep} 0%, ${C.night} 60%, ${C.nightSoft} 100%)`,
    }}
  />
);

const Small: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontFamily: sans, fontWeight: 500, fontSize: 30, letterSpacing: 4, textTransform: "uppercase", ...style }}>
    {children}
  </div>
);

const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Small style={{ color: C.amber, marginBottom: 40 }}>{children}</Small>
);

const Heading: React.FC<{ children: React.ReactNode; size: number }> = ({ children, size }) => (
  <div style={{ fontFamily: serif, fontWeight: 600, fontSize: size, lineHeight: 1.12, color: C.morning }}>
    {children}
  </div>
);

const Body: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginTop: 44, fontFamily: sans, fontSize: 46, lineHeight: 1.4, color: C.lamp }}>{children}</div>
);

// Мини-лестница: подсвечены ступени до текущей
const MiniLadder: React.FC<{ total: number; index: number }> = ({ total, index }) => (
  <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 80 }}>
    {Array.from({ length: total }, (_, i) => (
      <div
        key={i}
        style={{
          width: 64,
          height: 28 + i * 22,
          borderRadius: 8,
          background: i <= index ? C.amber : "rgba(242,220,187,.14)",
          opacity: i === index ? 1 : i < index ? 0.55 : 1,
        }}
      />
    ))}
  </div>
);

const SlideBody: React.FC<{ slide: Slide }> = ({ slide }) => {
  switch (slide.kind) {
    case "cover":
      return (
        <>
          {slide.kicker ? <Kicker>{slide.kicker}</Kicker> : null}
          <Heading size={104}>{slide.title}</Heading>
          {slide.sub ? <Body>{slide.sub}</Body> : null}
        </>
      );
    case "text":
      return (
        <>
          {slide.kicker ? <Kicker>{slide.kicker}</Kicker> : null}
          <Heading size={76}>{slide.title}</Heading>
          {slide.body ? <Body>{slide.body}</Body> : null}
        </>
      );
    case "step":
      return (
        <>
          <Small style={{ color: C.amber, marginBottom: 12 }}>Ступень</Small>
          <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 260, lineHeight: 1, color: C.amber }}>
            {slide.num}
          </div>
          <div style={{ marginTop: 36 }}>
            <Heading size={80}>{slide.title}</Heading>
          </div>
          <MiniLadder total={slide.total} index={slide.index} />
        </>
      );
    case "final":
      return (
        <>
          {slide.kicker ? <Kicker>{slide.kicker}</Kicker> : null}
          <Heading size={84}>{slide.title}</Heading>
          <div
            style={{
              marginTop: 64,
              alignSelf: "flex-start",
              background: C.amber,
              color: C.nightDeep,
              fontFamily: sans,
              fontWeight: 600,
              fontSize: 46,
              padding: "26px 50px",
              borderRadius: 999,
            }}
          >
            {slide.button}
          </div>
          {slide.note ? <Body>{slide.note}</Body> : null}
        </>
      );
  }
};

export const Carousel: React.FC<CarouselProps> = ({ slides }) => {
  const frame = useCurrentFrame();
  const slide = slides[Math.min(frame, slides.length - 1)];
  const last = frame >= slides.length - 1;
  return (
    <AbsoluteFill>
      <Glow />
      <AbsoluteFill style={{ padding: "96px 96px 110px", justifyContent: "space-between" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Small style={{ color: C.mute, letterSpacing: 3 }}>Сон без укачивания</Small>
          {slides.length > 1 ? (
            <Small style={{ color: C.mute, letterSpacing: 2 }}>
              {frame + 1}/{slides.length}
            </Small>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <SlideBody slide={slide} />
        </div>
        <div style={{ height: 40 }}>
          {!last ? <Small style={{ color: C.mute, textAlign: "right" }}>Листайте →</Small> : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
