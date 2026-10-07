import React from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const io = Easing.inOut(Easing.cubic);

type Move = { s: [number, number]; x: [number, number]; y: [number, number] };
const shots: { src: string; label: string; sub: string; m: Move }[] = [
  { src: "r1.jpg", label: "Фасад", sub: "вечерний свет", m: { s: [1.02, 1.16], x: [0, -2], y: [0, 1] } },
  { src: "r2.jpg", label: "Гостиная", sub: "панорамные окна", m: { s: [1.14, 1.14], x: [4, -4], y: [0, 0] } },
  { src: "r4.jpg", label: "Кухня-столовая", sub: "дневной свет", m: { s: [1.16, 1.03], x: [-2, 0], y: [1, 0] } },
  { src: "r3.jpg", label: "Ванная", sub: "травертин", m: { s: [1.12, 1.12], x: [-4, 4], y: [0, 0] } },
];
const D = 96;

const Shot: React.FC<{ src: string; label: string; sub: string; m: Move; i: number }> = ({ src, label, sub, m, i }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, D + 12], [0, 1], { ...clamp, easing: io });
  const o = interpolate(f, [0, 12, D, D + 12], [0, 1, 1, 0], clamp);
  const s = m.s[0] + (m.s[1] - m.s[0]) * t;
  const x = m.x[0] + (m.x[1] - m.x[0]) * t;
  const y = m.y[0] + (m.y[1] - m.y[0]) * t;
  const lt = interpolate(f, [14, 34], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <Img src={staticFile(`viz/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${s}) translate(${x}%, ${y}%)` }} />
      <AbsoluteFill style={{ background: "linear-gradient(0deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 35%)" }} />
      <div style={{ position: "absolute", left: 90, bottom: 90, color: "#fff", fontFamily: "Golos Text", opacity: lt, transform: `translateY(${(1 - lt) * 20}px)` }}>
        <div style={{ fontSize: 24, letterSpacing: 6, fontWeight: 700, color: "#e8c98f" }}>0{i + 1} / 04 · ВИЗУАЛИЗАЦИЯ</div>
        <div style={{ fontFamily: "Literata", fontSize: 76, fontWeight: 600, marginTop: 8 }}>{label}</div>
        <div style={{ fontSize: 30, opacity: 0.8, marginTop: 4 }}>{sub}</div>
      </div>
    </AbsoluteFill>
  );
};

export const VizReel: React.FC = () => (
  <AbsoluteFill style={{ background: "#000" }}>
    {shots.map((sh, i) => (
      <Sequence key={sh.src} from={i * D} durationInFrames={D + 12}>
        <Shot {...sh} i={i} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
