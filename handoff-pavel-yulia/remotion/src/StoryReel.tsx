import React from "react";
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import timing from "./storyTiming.json";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const FONT = "Golos Text";
const ACC = "#ffd23f";

// Сцены: клип, откуда брать, две строки; в квадратных скобках — слово-акцент
type Scene = { src: string; from: number; l1: string; l2: string };
const SCENES: Scene[] = [
  { src: "clips/cf3.mp4", from: 1, l1: "Он открыл кофейню", l2: "в городе, где пьют [растворимый]" },
  { src: "clips/ap5.mp4", from: 1, l1: "Друзья говорили:", l2: "[прогоришь] за полгода" },
  { src: "clips/cf2.mp4", from: 0.5, l1: "Он начал жарить зерно", l2: "прямо [в зале]" },
  { src: "clips/cf1.mp4", from: 1, l1: "Каждую чашку —", l2: "как для [лучшего друга]" },
  { src: "clips/cf4.mp4", from: 1, l1: "Через год к нему ехали из", l2: "[соседних городов]" },
  { src: "clips/gr1.mp4", from: 2, l1: "Не бойся делать", l2: "[по-своему]" },
  { src: "clips/gr1.mp4", from: 8, l1: "Сохрани,", l2: "если нужна [поддержка]" },
];

// Строка текста: слова выпрыгивают по очереди, акцент — на жёлтой плашке
const Line: React.FC<{ text: string; delay: number; size: number }> = ({ text, delay, size }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const parts = text.split(/(\[[^\]]+\])/).filter(Boolean);
  let wi = 0;
  const nodes: React.ReactNode[] = [];
  parts.forEach((p, pi) => {
    const acc = p.startsWith("[");
    const words = (acc ? p.slice(1, -1) : p).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;
    if (acc) {
      const s = spring({ frame: f - delay - wi++ * 2, fps, config: { damping: 11, stiffness: 180 } });
      nodes.push(
        <span key={pi} style={{ display: "inline-block", background: ACC, color: "#1b1204", textShadow: "none", padding: "0 18px 6px", borderRadius: 14, transform: `scale(${0.6 + 0.4 * s}) rotate(${(1 - s) * -6}deg)`, opacity: Math.min(1, s * 2), boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
          {words.join(" ")}
        </span>,
      );
    } else {
      words.forEach((w, k) => {
        const s = spring({ frame: f - delay - wi++ * 2, fps, config: { damping: 14, stiffness: 200 } });
        nodes.push(
          <span key={`${pi}-${k}`} style={{ display: "inline-block", transform: `translateY(${(1 - s) * 40}px)`, opacity: s }}>
            {w}
          </span>,
        );
      });
    }
  });
  return <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: size * 0.26, rowGap: 8, lineHeight: 1.15 }}>{nodes}</div>;
};

const SceneView: React.FC<{ s: Scene; dur: number; last: boolean }> = ({ s, dur, last }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  // склейка: «удар» зумом + вспышка; внутри сцены — медленный наезд
  const punch = interpolate(f, [0, 9], [1.16, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const push = interpolate(f, [0, dur], [1, 1.07], clamp);
  const flash = interpolate(f, [0, 6], [0.35, 0], clamp);
  const outFade = last ? 1 : interpolate(f, [dur - 6, dur], [1, 0], clamp);
  const d1 = Math.round(0.35 * fps), d2 = Math.round(0.9 * fps);
  const shadow = "0 4px 24px rgba(0,0,0,.6)";
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${punch * push})`, filter: "contrast(1.06) saturate(1.12) sepia(.1)" }}>
        <OffthreadVideo src={staticFile(s.src)} startFrom={Math.round(s.from * fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: last ? "rgba(10,6,2,.45)" : "linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.5) 62%,rgba(0,0,0,.15) 85%)" }} />
      <div style={{ position: "absolute", left: 70, right: 70, top: last ? 760 : 1060, opacity: outFade }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 64, color: "#fff", textShadow: shadow, marginBottom: 18 }}>
          <Line text={s.l1} delay={d1} size={64} />
        </div>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 92, color: "#fff", textShadow: shadow, letterSpacing: -1 }}>
          <Line text={s.l2} delay={d2} size={92} />
        </div>
        {last && (
          <div style={{ marginTop: 60, textAlign: "center", fontFamily: FONT, fontWeight: 600, fontSize: 34, color: "rgba(255,255,255,.75)", opacity: interpolate(f, [40, 55], [0, 1], clamp) }}>
            пример монтажа · @ferzas1o
          </div>
        )}
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};

export const STORY_FRAMES = timing.end;

export const StoryReel: React.FC = () => {
  const cuts = [...timing.cuts, timing.end];
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {SCENES.map((s, i) => (
        <Sequence key={i} from={cuts[i]} durationInFrames={cuts[i + 1] - cuts[i]}>
          <SceneView s={s} dur={cuts[i + 1] - cuts[i]} last={i === SCENES.length - 1} />
        </Sequence>
      ))}
      <Audio src={staticFile("story/story.wav")} />
    </AbsoluteFill>
  );
};
