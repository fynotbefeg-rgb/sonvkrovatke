// Задача 2 Павла: 5-секундные интро курса Росмолодёжи, 1920×1080, 25 fps.
// A — «рамки» (ref-A-ramki.jpg), B — «фото-взрыв» (ref-B-foto.jpg). Геометрия в координатах референса 1280×720.
import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/fonts";

loadFont({ family: "Rosmol Sans", url: staticFile("rm/RosmolBold.otf"), weight: "700" });
loadFont({ family: "Rosmol Sans", url: staticFile("rm/RosmolMedium.otf"), weight: "500" });

export const RM2_DUR = 125;
const C = { blue: "#1247e3", red: "#ff4632", cyan: "#7deee8", cyanL: "#a6f1f3", ink: "#14161c", bg: "#f4f5f7" };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const K = 1.5; // ref → 1080p
type P = [number, number][];
const pts = (p: P) => p.map(([x, y]) => `${x},${y}`).join(" ");
const center = (p: P) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
const ramp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });

const LINES_A = [
  { t: "Проектирование,", c: C.ink }, { t: "организация и проведение", c: C.ink },
  { t: "молодежных мероприятий,", c: C.blue }, { t: "проектов и программ", c: C.blue },
];

const Headline: React.FC<{ lines: { t: string; c: string }[]; top: number; left: number; start: number; size?: number }> = ({ lines, top, left, start, size = 76 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return (
    <div style={{ position: "absolute", left, top, fontFamily: "Rosmol Sans", fontWeight: 700, fontSize: size, lineHeight: 1.08, letterSpacing: -0.5 }}>
      {lines.map((l, i) => {
        const p = spring({ frame: f - start - i * 4, fps, config: { damping: 200, mass: 0.7 } });
        return (
          <div key={i} style={{ overflow: "hidden", paddingBottom: "0.12em", marginBottom: "-0.12em" }}>
            <div style={{ color: l.c, transform: `translateY(${(1 - p) * 105}%)` }}>{l.t}</div>
          </div>
        );
      })}
    </div>
  );
};

const Chip: React.FC<{ x: number; y: number; bg: string; color: string; radius: number; start: number; size?: number }> = ({ x, y, bg, color, radius, start, size = 44 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const p = spring({ frame: f - start, fps, config: { damping: 13, mass: 0.6 } });
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `scale(${p})`, transformOrigin: "left center", background: bg, color, borderRadius: radius,
      padding: `${size * 0.32}px ${size * 0.8}px`, fontFamily: "Rosmol Sans", fontWeight: 700, fontSize: size }}>Онлайн-курс</div>
  );
};

// ---------------- A: рамки ----------------
const Slide: React.FC<{ p: P; fill?: string; stroke?: string; sw?: number; from: [number, number]; t: number; drift: [number, number] }> = ({ p, fill, stroke, sw, from, t, drift }) => {
  const f = useCurrentFrame();
  const dx = from[0] * (1 - t) + drift[0] * f / RM2_DUR, dy = from[1] * (1 - t) + drift[1] * f / RM2_DUR;
  return <polygon points={pts(p)} fill={fill ?? "none"} stroke={stroke} strokeWidth={sw} strokeLinejoin="miter" transform={`translate(${dx} ${dy})`} opacity={Math.min(1, t * 3)} />;
};

const Draw: React.FC<{ p: P; stroke: string; sw: number; t: number }> = ({ p, stroke, sw, t }) => {
  const per = p.reduce((s, q, i) => { const n = p[(i + 1) % p.length]; return s + Math.hypot(n[0] - q[0], n[1] - q[1]); }, 0);
  return <polygon points={pts(p)} fill="none" stroke={stroke} strokeWidth={sw} strokeDasharray={per} strokeDashoffset={per * (1 - t)} />;
};

export const RM2_A: React.FC = () => {
  const f = useCurrentFrame();
  const win = spring({ frame: f - 6, fps: 25, config: { damping: 15, mass: 0.9 } });
  const inner = ramp(f, 18, 38), door = ramp(f, 26, 48);
  const sway = Math.sin(f / 22) * 2;
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      <svg viewBox="0 0 1280 720" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <Slide p={[[0, 38], [150, 0], [214, 0], [214, 74], [0, 112]]} fill={C.cyan} from={[-260, -60]} t={ramp(f, 0, 18)} drift={[-6, -3]} />
        <Slide p={[[1030, 78], [1280, 0], [1280, 96], [1030, 152]]} fill={C.red} from={[300, -80]} t={ramp(f, 3, 21)} drift={[6, -3]} />
        <Slide p={[[0, 505], [362, 640], [362, 720], [0, 720]]} fill={C.blue} from={[-400, 150]} t={ramp(f, 2, 20)} drift={[-8, 4]} />
        <Slide p={[[815, 690], [1280, 528], [1280, 720], [815, 720]]} fill={C.cyanL} from={[420, 160]} t={ramp(f, 5, 23)} drift={[8, 4]} />
        <Draw p={[[806, 125], [962, 36], [962, 104], [806, 192]]} stroke={C.red} sw={4} t={ramp(f, 14, 40)} />
        <Draw p={[[408, 606], [590, 540], [590, 604], [408, 664]]} stroke={C.cyan} sw={4} t={ramp(f, 20, 46)} />
        {/* окно */}
        <g transform={`translate(1108 368) rotate(${(1 - win) * -14 + sway * 0.3}) scale(${0.25 + win * 0.75}) translate(-1108 -368)`} opacity={Math.min(1, win * 2)}>
          <path d={`M${pts([[990, 225], [1226, 134], [1226, 600], [990, 524]])}Z M${pts([[1030, 252], [1030, 476], [1176, 520], [1176, 205]])}Z`} fill={C.blue} fillRule="evenodd" />
          <g opacity={inner} transform={`translate(${(1 - inner) * 30} 0)`}>
            <polygon points={pts([[1055, 290], [1150, 266], [1150, 280], [1070, 302], [1070, 438], [1150, 456], [1150, 470], [1055, 446]])} fill={C.cyan} />
          </g>
          <polygon points={pts([[1100, 298], [1156, 284], [1156, 484], [1100, 462]])} fill={C.red} transform={`translate(1100 0) scale(${door} 1) translate(-1100 0)`} />
        </g>
      </svg>
      <Chip x={172} y={214} bg={C.red} color="#fff" radius={50} start={14} size={50} />
      <Headline lines={LINES_A} top={330} left={168} start={20} size={94} />
    </AbsoluteFill>
  );
};

// ---------------- B: фото-взрыв ----------------
const ORIGIN: [number, number] = [860, 470];
const Shard: React.FC<{ p: P; fill?: string; img?: string; t: number; i: number }> = ({ p, fill, img, t, i }) => {
  const f = useCurrentFrame();
  const [cx, cy] = center(p);
  const dx = (ORIGIN[0] - cx) * (1 - t), dy = (ORIGIN[1] - cy) * (1 - t);
  const push = (f / RM2_DUR) * 0.04; // медленный разлёт после взрыва
  const px = (cx - ORIGIN[0]) * push, py = (cy - ORIGIN[1]) * push;
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const style: React.CSSProperties = {
    position: "absolute", inset: 0, clipPath: `polygon(${p.map(([x, y]) => `${x * K}px ${y * K}px`).join(",")})`,
    transform: `translate(${(dx + px) * K}px, ${(dy + py) * K}px) scale(${0.4 + 0.6 * t})`, transformOrigin: `${cx * K}px ${cy * K}px`, opacity: Math.min(1, t * 2.5),
  };
  return (
    <div style={style} data-i={i}>
      {img ? <Img src={staticFile(`rm2/${img}`)} style={{ position: "absolute", left: x0 * K, top: y0 * K, width: (x1 - x0) * K, height: (y1 - y0) * K, objectFit: "cover",
        transform: `scale(${1.08 - 0.08 * (f / RM2_DUR)})` }} /> : <div style={{ position: "absolute", inset: 0, background: fill }} />}
    </div>
  );
};

const SHARDS: { p: P; fill?: string; img?: string }[] = [
  { p: [[545, 720], [598, 612], [840, 505], [738, 720]], fill: C.red },
  { p: [[738, 720], [846, 548], [858, 556], [792, 720]], fill: C.cyan },
  { p: [[960, 456], [1280, 572], [1280, 720], [1010, 720], [902, 562]], img: "p4.jpg" },
  { p: [[1004, 302], [1226, 262], [1250, 506], [986, 482]], img: "p3.jpg" },
  { p: [[1000, 196], [1280, 96], [1280, 292], [966, 336]], img: "p2.jpg" },
  { p: [[786, 0], [1000, 0], [962, 256], [772, 232]], img: "p1.jpg" },
  { p: [[990, 92], [1240, 0], [1280, 0], [1280, 40], [944, 216]], fill: C.blue },
  { p: [[638, 50], [695, 22], [712, 198], [652, 210]], fill: C.red },
  { p: [[695, 22], [745, 30], [738, 190], [712, 198]], fill: C.cyan },
  { p: [[920, 286], [956, 278], [940, 350], [912, 352]], fill: C.blue },
  { p: [[918, 388], [966, 382], [962, 404], [920, 410]], fill: C.red },
  { p: [[870, 452], [926, 470], [914, 500], [862, 480]], fill: C.blue },
  { p: [[962, 626], [1150, 720], [1104, 720], [962, 642]], fill: C.blue },
];

const Rays: React.FC = () => {
  const f = useCurrentFrame();
  const t = ramp(f, 30, 48), pulse = 1 + Math.max(0, Math.sin((f - 48) / 6)) * 0.12 * (f > 48 ? 1 : 0);
  const fr = (p: P, c: string, d: number) => <polyline points={pts(p)} fill="none" stroke={c} strokeWidth={9} opacity={ramp(f, 24 + d, 36 + d)}
    transform={`translate(${(1 - ramp(f, 24 + d, 36 + d)) * -20} 0)`} />;
  return (
    <svg viewBox="0 0 1280 720" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {fr([[100, 528], [74, 520], [74, 652], [100, 646]], C.red, 0)}
      {fr([[124, 538], [104, 534], [104, 630], [124, 626]], C.cyan, 3)}
      {fr([[128, 550], [150, 545], [150, 612], [128, 606]], C.blue, 6)}
      <g transform={`translate(162 580) scale(${t * pulse}) translate(-162 -580)`} stroke={C.red} strokeWidth={5} strokeLinecap="round">
        <line x1={176} y1={542} x2={196} y2={518} /><line x1={186} y1={566} x2={226} y2={552} /><line x1={186} y1={586} x2={214} y2={600} />
      </g>
    </svg>
  );
};

export const RM2_B: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const flash = interpolate(f, [4, 8, 16], [0, 0.9, 0], clamp);
  return (
    <AbsoluteFill style={{ background: C.bg, overflow: "hidden" }}>
      {SHARDS.map((s, i) => (
        <Shard key={i} i={i} {...s} t={spring({ frame: f - 4 - (i % 7) * 1.6, fps, config: { damping: 16, mass: 0.7 } })} />
      ))}
      <div style={{ position: "absolute", left: ORIGIN[0] * K - 260, top: ORIGIN[1] * K - 260, width: 520, height: 520, borderRadius: "50%",
        background: `radial-gradient(circle, ${C.cyanL} 0%, transparent 65%)`, opacity: flash, transform: `scale(${0.3 + ramp(f, 4, 16) * 1.4})` }} />
      <Chip x={105} y={280} bg={C.cyan} color={C.ink} radius={4} start={16} />
      <Headline lines={[0, 1, 2, 3].map((i) => ({ t: LINES_A[i].t, c: C.ink }))} top={370} left={103} start={22} />
      <Rays />
    </AbsoluteFill>
  );
};
