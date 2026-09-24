import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Video } from "@remotion/media";
import { Background, C, Kicker, Rise, Scene, Title, clamp, sans, serif } from "./theme";

// Сцена рилса. Длительность в кадрах (30 fps), footage — файл из public/footage
type Base = { duration: number; footage?: string };

export type SceneSpec = Base &
  (
    | { kind: "hook"; kicker?: string; lines: string[]; size?: number }
    | { kind: "timeline"; kicker?: string; rows: [string, string][]; accentLast?: boolean }
    | { kind: "statement"; kicker?: string; title: string; body?: string; highlight?: string; size?: number }
    | { kind: "steps"; kicker?: string; items: string[] }
    | { kind: "ladder"; kicker?: string; steps: string[] }
    | { kind: "cta"; kicker: string; title: string; button: string; note?: string }
  );

export type ReelProps = { scenes: SceneSpec[] };

export const reelDuration = (scenes: SceneSpec[]) =>
  scenes.reduce((sum, s) => sum + s.duration, 0);

const Hook: React.FC<Extract<SceneSpec, { kind: "hook" }>> = ({ duration, kicker, lines, size = 132 }) => (
  <Scene duration={duration}>
    {kicker ? (
      <Rise>
        <Kicker>{kicker}</Kicker>
      </Rise>
    ) : null}
    <Title size={size}>
      {lines.map((line, i) => (
        <Rise key={line} delay={6 + i * 7} style={{ display: "block" }}>
          {line}
        </Rise>
      ))}
    </Title>
  </Scene>
);

const Timeline: React.FC<Extract<SceneSpec, { kind: "timeline" }>> = ({
  duration,
  kicker,
  rows,
  accentLast = true,
}) => {
  const step = Math.min(24, Math.floor((duration - 40) / rows.length));
  return (
    <Scene duration={duration}>
      {kicker ? (
        <Rise>
          <Kicker>{kicker}</Kicker>
        </Rise>
      ) : null}
      {rows.map(([t, text], i) => {
        const last = accentLast && i === rows.length - 1;
        return (
          <Rise key={t + text} delay={4 + i * step} style={{ display: "flex", gap: 44, marginBottom: 46 }}>
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

const Statement: React.FC<Extract<SceneSpec, { kind: "statement" }>> = ({
  duration,
  kicker,
  title,
  body,
  highlight,
  size = 96,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hl = spring({ frame: frame - 44, fps, config: { damping: 200 } });
  return (
    <Scene duration={duration}>
      {kicker ? (
        <Rise>
          <Kicker>{kicker}</Kicker>
        </Rise>
      ) : null}
      <Rise delay={kicker ? 6 : 0}>
        <Title size={size}>{title}</Title>
      </Rise>
      {body || highlight ? (
        <Rise delay={20} style={{ marginTop: 56 }}>
          <div style={{ fontFamily: sans, fontSize: 64, lineHeight: 1.3, color: C.lamp }}>
            {body}
            {body && highlight ? " " : null}
            {highlight ? (
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
                <span style={{ position: "relative" }}>{highlight}</span>
              </span>
            ) : null}
          </div>
        </Rise>
      ) : null}
    </Scene>
  );
};

const Steps: React.FC<Extract<SceneSpec, { kind: "steps" }>> = ({ duration, kicker, items }) => {
  const step = Math.min(30, Math.floor((duration - 40) / items.length));
  return (
    <Scene duration={duration}>
      {kicker ? (
        <Rise>
          <Kicker>{kicker}</Kicker>
        </Rise>
      ) : null}
      {items.map((item, i) => (
        <Rise key={item} delay={4 + i * step} style={{ display: "flex", gap: 36, marginBottom: 52 }}>
          <div
            style={{
              flex: "0 0 auto",
              width: 84,
              height: 84,
              borderRadius: 999,
              border: `3px solid ${C.amber}`,
              color: C.amber,
              fontFamily: sans,
              fontWeight: 600,
              fontSize: 46,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {i + 1}
          </div>
          <div style={{ fontFamily: sans, fontSize: 58, lineHeight: 1.25, color: C.morning, paddingTop: 6 }}>
            {item}
          </div>
        </Rise>
      ))}
    </Scene>
  );
};

// Лестница ступеней: подсветка идёт снизу вверх, от 0 к 7
const Ladder: React.FC<Extract<SceneSpec, { kind: "ladder" }>> = ({ duration, kicker, steps }) => {
  const frame = useCurrentFrame();
  const per = Math.floor((duration - 30) / steps.length);
  const active = Math.min(steps.length - 1, Math.floor(Math.max(0, frame - 10) / per));
  return (
    <Scene duration={duration}>
      {kicker ? (
        <Rise>
          <Kicker>{kicker}</Kicker>
        </Rise>
      ) : null}
      <div style={{ display: "flex", flexDirection: "column-reverse" }}>
        {steps.map((s, i) => {
          const on = i <= active;
          const current = i === active;
          return (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 30,
                marginTop: 18,
                marginLeft: i * 14,
                opacity: interpolate(frame - 10 - i * per, [0, 10], [0.28, 1], clamp),
              }}
            >
              <div
                style={{
                  width: 64,
                  fontFamily: sans,
                  fontWeight: 600,
                  fontSize: 48,
                  color: on ? C.amber : C.mute,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {i}
              </div>
              <div
                style={{
                  fontFamily: current ? serif : sans,
                  fontWeight: current ? 600 : 400,
                  fontSize: current ? 56 : 46,
                  color: current ? C.morning : on ? C.lamp : C.mute,
                }}
              >
                {s}
              </div>
            </div>
          );
        })}
      </div>
    </Scene>
  );
};

const Cta: React.FC<Extract<SceneSpec, { kind: "cta" }>> = ({ duration, kicker, title, button, note }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 34, fps, config: { damping: 14, stiffness: 120 } });
  return (
    <Scene duration={duration}>
      <Rise>
        <Kicker>{kicker}</Kicker>
      </Rise>
      <Rise delay={6}>
        <Title size={96}>{title}</Title>
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
        {button}
      </div>
      {note ? (
        <Rise delay={44} style={{ marginTop: 40 }}>
          <div style={{ fontFamily: sans, fontSize: 44, color: C.mute }}>{note}</div>
        </Rise>
      ) : null}
    </Scene>
  );
};

// Видеофон сцены: медленный наезд и затемнение под текст
const Footage: React.FC<{ src: string; duration: number }> = ({ src, duration }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, duration - 10, duration], [0, 1, 1, 0], clamp);
  const scale = interpolate(frame, [0, duration], [1.06, 1.14]);
  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Video
          src={staticFile(`footage/${src}`)}
          muted
          loop
          objectFit="cover"
          style={{ width: "100%", height: "100%" }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, rgba(10,20,29,.55) 0%, rgba(10,20,29,.78) 45%, rgba(10,20,29,.9) 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const SceneBody: React.FC<{ spec: SceneSpec }> = ({ spec }) => {
  switch (spec.kind) {
    case "hook":
      return <Hook {...spec} />;
    case "timeline":
      return <Timeline {...spec} />;
    case "statement":
      return <Statement {...spec} />;
    case "steps":
      return <Steps {...spec} />;
    case "ladder":
      return <Ladder {...spec} />;
    case "cta":
      return <Cta {...spec} />;
  }
};

export const Reel: React.FC<ReelProps> = ({ scenes }) => {
  let from = 0;
  return (
    <AbsoluteFill>
      <Background />
      {scenes.map((spec, i) => {
        const start = from;
        from += spec.duration;
        return (
          <Sequence key={i} from={start} durationInFrames={spec.duration}>
            {spec.footage ? <Footage src={spec.footage} duration={spec.duration} /> : null}
            <SceneBody spec={spec} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
