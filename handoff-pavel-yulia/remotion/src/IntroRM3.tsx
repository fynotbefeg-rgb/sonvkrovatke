// Раунд 2 (20.10) — всё по согласованной презентации «Готово-1» (pavel-rosmolodezh/brand/Gotovo-1.pdf):
// белый / бирюзовый фон, бледно-бирюзовые «ступенчатые» фигуры, индиго, заголовки капсом Rosmol, плашки Granate, фото в фигурах.
// RM3_IA / RM3_IB — интро курса 5 с @25 (задача 2); RM3_V1 / RM3_V2 — заставки уроков 4 с @30 (задача 1).
import React from "react";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/fonts";
import { ALL, COURSE_FULL } from "./IntroRM";

loadFont({ family: "Rosmol Sans", url: staticFile("rm/RosmolBold.otf"), weight: "700" });
loadFont({ family: "ALS Granate", url: staticFile("rm/GranateReg.otf"), weight: "400" });
loadFont({ family: "ALS Granate", url: staticFile("rm/GranateBold.otf"), weight: "700" });

const C = { cyan: "#9af5ff", pale: "#dcfbff", indigo: "#2a1c8c", ink: "#232323", white: "#ffffff" };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.16, 1, 0.3, 1);
const ramp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });
export const RM3_INTRO = 125, RM3_LESSON = 120;

// ---------- фигуры презентации: четырёхугольник со «ступенькой», скруглённые углы ----------
type P = [number, number][];
const STEP_TOP: P = [[0, 0.04], [0.6, 0], [0.61, 0.13], [1, 0.11], [0.97, 1], [0.03, 0.96]];
const STEP_LEFT: P = [[0.05, 0], [1, 0.05], [0.96, 1], [0.42, 0.97], [0.41, 0.85], [0, 0.87]];
const STEP_RIGHT: P = [[0, 0.06], [0.97, 0], [1, 0.58], [0.88, 0.6], [0.9, 1], [0.04, 0.95]];
const roundPath = (p: P, w: number, h: number, r: number) => {
  const pts = p.map(([x, y]) => [x * w, y * h]);
  let d = "";
  pts.forEach((q, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
    const la = Math.hypot(a[0] - q[0], a[1] - q[1]), lb = Math.hypot(b[0] - q[0], b[1] - q[1]);
    const ra = Math.min(r, la / 2), rb = Math.min(r, lb / 2);
    const s = [q[0] + (a[0] - q[0]) * ra / la, q[1] + (a[1] - q[1]) * ra / la];
    const e = [q[0] + (b[0] - q[0]) * rb / lb, q[1] + (b[1] - q[1]) * rb / lb];
    d += `${i ? "L" : "M"}${s[0]},${s[1]} Q${q[0]},${q[1]} ${e[0]},${e[1]} `;
  });
  return d + "Z";
};

let uid = 0;
const Shape: React.FC<{ p: P; x: number; y: number; w: number; h: number; fill?: string; img?: string; stroke?: string; sw?: number; draw?: number;
  rot?: number; style?: React.CSSProperties; imgScale?: number; imgPos?: string; gray?: boolean }> =
  ({ p, x, y, w, h, fill, img, stroke, sw = 4, draw = 1, rot = 0, style, imgScale = 1, imgPos = "50% 50%", gray }) => {
    const id = React.useMemo(() => `cp${uid++}`, []);
    const d = roundPath(p, w, h, 26);
    const per = 2 * (w + h) * 1.05;
    return (
      <svg width={w + 20} height={h + 20} viewBox={`-10 -10 ${w + 20} ${h + 20}`} style={{ position: "absolute", left: x - 10, top: y - 10, overflow: "visible", transform: `rotate(${rot}deg)`, ...style }}>
        {img ? (
          <>
            <defs><clipPath id={id}><path d={d} /></clipPath></defs>
            <g clipPath={`url(#${id})`}>
              <foreignObject x={0} y={0} width={w} height={h}>
                <div style={{ width: w, height: h, backgroundImage: `url(${staticFile(`rm2/${img}`)})`, backgroundSize: "cover", backgroundPosition: imgPos,
                  transform: `scale(${imgScale})`, filter: gray ? "grayscale(1)" : undefined }} />
              </foreignObject>
            </g>
          </>
        ) : stroke ? (
          <path d={d} fill="none" stroke={stroke} strokeWidth={sw} strokeDasharray={per} strokeDashoffset={per * (1 - draw)} strokeLinejoin="round" />
        ) : <path d={d} fill={fill} />}
      </svg>
    );
  };

const Chip: React.FC<{ text: string; bg: string; color: string; size: number; t: number; style?: React.CSSProperties }> = ({ text, bg, color, size, t, style }) => (
  <div style={{ display: "inline-block", background: bg, color, borderRadius: size, padding: `${size * 0.22}px ${size * 0.6}px ${size * 0.26}px`,
    fontFamily: "ALS Granate", fontWeight: 700, fontSize: size, transform: `scale(${t})`, transformOrigin: "left center", ...style }}>{text}</div>
);

// заголовок капсом, построчная выкатка снизу
const Title: React.FC<{ lines: string[]; size: number; start: number; color?: string; align?: "left" | "center" }> = ({ lines, size, start, color = C.ink, align = "left" }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  return (
    <div style={{ fontFamily: "Rosmol Sans", fontWeight: 700, fontSize: size, lineHeight: 1.04, color, textTransform: "uppercase", textAlign: align }}>
      {lines.map((l, i) => {
        const p = spring({ frame: f - start - i * 3, fps, config: { damping: 200, mass: 0.7 } });
        return <div key={i} style={{ overflow: "hidden", paddingBottom: "0.1em", marginBottom: "-0.1em" }}>
          <div style={{ transform: `translateY(${(1 - p) * 105}%)` }}>{l}</div></div>;
      })}
    </div>
  );
};
const COURSE_LINES = ["Проектирование,", "организация и проведение", "молодежных мероприятий,", "проектов и программ"];

// перенос названия урока на строки ~maxCh символов
const wrap = (s: string, maxCh: number) => {
  const out: string[] = []; let cur = "";
  for (const w of s.split(" ")) { if ((cur + " " + w).trim().length > maxCh && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  out.push(cur);
  // предлог/союз в конце строки переносим на следующую
  for (let i = 0; i < out.length - 1; i++) {
    const ws = out[i].split(" "), last = ws[ws.length - 1];
    if (ws.length > 1 && last.length <= 2) { ws.pop(); out[i] = ws.join(" "); out[i + 1] = `${last} ${out[i + 1]}`; }
  }
  return out;
};

// ============ ИНТРО A: белый фон, фото в фигурах (как слайды 1–3 презентации) ============
export const RM3_IA: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const pale = spring({ frame: f - 2, fps, config: { damping: 20, mass: 0.9 } });
  const ph1 = spring({ frame: f - 6, fps, config: { damping: 18, mass: 0.8 } });
  const ph2 = spring({ frame: f - 44, fps, config: { damping: 16, mass: 0.7 } });
  const drift = f / RM3_INTRO;
  return (
    <AbsoluteFill style={{ background: C.white, overflow: "hidden" }}>
      <Shape p={STEP_RIGHT} x={1060} y={40} w={900} h={760} fill={C.pale} rot={-4 + drift * 1.5}
        style={{ transform: `translate(${(1 - pale) * 500}px, ${-drift * 10}px) rotate(${-4 + drift * 1.5}deg)` }} />
      <Shape p={STEP_TOP} x={1110} y={170} w={700} h={560} img="f018.jpg" imgScale={1.12 - 0.08 * drift} imgPos="50% 40%"
        style={{ transform: `translateX(${(1 - ph1) * 900}px) rotate(${(1 - ph1) * 8 - 3}deg)` }} />
      <Shape p={STEP_LEFT} x={1450} y={640} w={420} h={310} img="f012.jpg" imgScale={1.1 - 0.06 * drift} imgPos="50% 35%"
        style={{ transform: `translateY(${(1 - ph2) * 500}px) rotate(${(1 - ph2) * -10 + 3}deg)`, opacity: Math.min(1, ph2 * 2) }} />
      <div style={{ position: "absolute", left: 140, top: 330 }}>
        <Chip text="Онлайн-курс" bg={C.indigo} color={C.white} size={40} t={spring({ frame: f - 14, fps, config: { damping: 14, mass: 0.6 } })} />
        <div style={{ height: 34 }} />
        <Title lines={COURSE_LINES} size={62} start={20} />
      </div>
    </AbsoluteFill>
  );
};

// ============ ИНТРО B: бирюзовый фон, типографика по центру, контурная рамка (как слайды «цитата» и «спасибо») ============
export const RM3_IB: React.FC = () => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const a = spring({ frame: f - 2, fps, config: { damping: 20 } }), b = spring({ frame: f - 8, fps, config: { damping: 20 } });
  const drift = f / RM3_INTRO;
  return (
    <AbsoluteFill style={{ background: C.cyan, overflow: "hidden" }}>
      <Shape p={STEP_LEFT} x={-160} y={-120} w={900} h={620} fill={C.pale} rot={-8}
        style={{ transform: `translate(${(1 - a) * -700 + drift * 20}px, ${(1 - a) * -300}px) rotate(-8deg)`, opacity: 0.85 }} />
      <Shape p={STEP_TOP} x={1180} y={560} w={900} h={640} fill={C.pale} rot={6}
        style={{ transform: `translate(${(1 - b) * 700 - drift * 20}px, ${(1 - b) * 300}px) rotate(6deg)`, opacity: 0.85 }} />
      <Shape p={STEP_TOP} x={300} y={250} w={1320} h={640} stroke={C.indigo} sw={5} draw={ramp(f, 10, 52)} rot={-1.5} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", paddingTop: 60 }}>
        <Chip text="Онлайн-курс" bg={C.indigo} color={C.white} size={40} t={spring({ frame: f - 18, fps, config: { damping: 14, mass: 0.6 } })}
          style={{ transformOrigin: "center", marginBottom: 34 }} />
        <Title lines={COURSE_LINES} size={74} start={24} align="center" />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============ ЗАСТАВКИ УРОКОВ ============
type L = { n: number; title: string; idx: number };
const lessonLabel = (n: number) => (n ? `Урок ${n}` : "Дополнительный урок");
const PHOTOS = [
  { img: "f018.jpg", pos: "50% 40%" }, { img: "f012.jpg", pos: "55% 35%" }, { img: "f010.jpg", pos: "50% 30%" },
  { img: "f016.jpg", pos: "50% 60%" }, { img: "f006.jpg", pos: "75% 40%" }, { img: "f004.jpg", pos: "50% 55%" }, { img: "f020.jpg", pos: "45% 40%" },
];
const titleSize = (t: string) => (t.length > 60 ? 56 : t.length > 36 ? 68 : 80);

// V1 — белая, фото в фигуре справа (как слайд 1 презентации)
const LessonV1: React.FC<{ l: L }> = ({ l }) => {
  const f = useCurrentFrame(); const { fps, durationInFrames: D } = useVideoConfig();
  const ph = PHOTOS[l.idx % PHOTOS.length];
  const pale = spring({ frame: f, fps, config: { damping: 20 } }), photo = spring({ frame: f - 5, fps, config: { damping: 18, mass: 0.8 } });
  const out = interpolate(f, [D - 10, D], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const size = titleSize(l.title);
  return (
    <AbsoluteFill style={{ background: C.white, overflow: "hidden", opacity: 1 - out }}>
      <Shape p={STEP_RIGHT} x={1100} y={-60} w={860} h={520} fill={C.pale} style={{ transform: `translateX(${(1 - pale) * 600}px)` }} />
      <Shape p={STEP_TOP} x={1000} y={130} w={820} h={820} img={ph.img} imgPos={ph.pos} imgScale={1.1 - 0.06 * (f / D)} gray={ph.img === "f020.jpg"}
        style={{ transform: `translateX(${(1 - photo) * 800}px) rotate(${(1 - photo) * 8 - 2}deg)` }} />
      <div style={{ position: "absolute", left: 140, top: 0, bottom: 0, width: 800, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div><Chip text={lessonLabel(l.n)} bg={C.pale} color={C.ink} size={34} t={spring({ frame: f - 10, fps, config: { damping: 14, mass: 0.6 } })} /></div>
        <div style={{ height: 30 }} />
        <Title lines={wrap(l.title, Math.round(1400 / size))} size={size} start={14} />
        <div style={{ marginTop: 40, fontFamily: "ALS Granate", fontSize: 26, lineHeight: 1.35, color: `${C.ink}b0`, width: 640, opacity: ramp(f, 30, 44) }}>{COURSE_FULL}</div>
      </div>
    </AbsoluteFill>
  );
};

// V2 — бирюзовая, номер урока внутри бледной фигуры с запасом, индикатор уроков справа вверху, всё по левой оси
const LessonV2: React.FC<{ l: L }> = ({ l }) => {
  const f = useCurrentFrame(); const { fps, durationInFrames: D } = useVideoConfig();
  const sh = spring({ frame: f - 2, fps, config: { damping: 18 } }), nm = spring({ frame: f - 12, fps, config: { damping: 16 } });
  const out = interpolate(f, [D - 10, D], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const size = titleSize(l.title);
  const num = l.n ? String(l.n).padStart(2, "0") : "+";
  return (
    <AbsoluteFill style={{ background: C.cyan, overflow: "hidden", opacity: 1 - out }}>
      {/* фигура с номером: бледная, плоская, номер вписан с полями */}
      <div style={{ position: "absolute", left: 1190, top: 250, width: 600, height: 560, transform: `translateX(${(1 - sh) * 700}px) rotate(${(1 - sh) * 10 - 3}deg)` }}>
        <Shape p={STEP_LEFT} x={0} y={0} w={600} h={560} fill={C.pale} />
        <div style={{ position: "absolute", left: 0, right: 0, top: 70, textAlign: "center", fontFamily: "Rosmol Sans", fontWeight: 700, fontSize: 300, lineHeight: 1,
          color: C.indigo, transform: `scale(${0.8 + nm * 0.2})`, opacity: nm }}>{num}</div>
      </div>
      {/* индикатор уроков — правый верхний угол */}
      <div style={{ position: "absolute", right: 130, top: 96, display: "flex", gap: 10, opacity: ramp(f, 16, 30) }}>
        {ALL.map((_, i) => <div key={i} style={{ width: 34, height: 10, borderRadius: 5, background: i === l.idx ? C.indigo : i < l.idx ? `${C.indigo}66` : `${C.white}cc` }} />)}
      </div>
      {/* левая ось: плашка, заголовок, курс */}
      <div style={{ position: "absolute", left: 140, top: 0, bottom: 0, width: 920, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div><Chip text={lessonLabel(l.n)} bg={C.indigo} color={C.white} size={34} t={spring({ frame: f - 8, fps, config: { damping: 14, mass: 0.6 } })} /></div>
        <div style={{ height: 30 }} />
        <Title lines={wrap(l.title, Math.round(1500 / size))} size={size} start={12} />
        <div style={{ marginTop: 40, fontFamily: "ALS Granate", fontSize: 26, lineHeight: 1.35, color: `${C.ink}b0`, width: 680, opacity: ramp(f, 28, 42) }}>{COURSE_FULL}</div>
      </div>
    </AbsoluteFill>
  );
};

const series = (Comp: React.FC<{ l: L }>, all: boolean) => () => (
  <AbsoluteFill>
    {(all ? ALL : ALL.slice(0, 4)).map((x, i) => <Sequence key={i} from={i * RM3_LESSON} durationInFrames={RM3_LESSON}><Comp l={{ ...x, idx: i }} /></Sequence>)}
  </AbsoluteFill>
);
export const RM3_V1 = series(LessonV1, false), RM3_V2 = series(LessonV2, false);
export const RM3_V1_ALL = series(LessonV1, true), RM3_V2_ALL = series(LessonV2, true);
