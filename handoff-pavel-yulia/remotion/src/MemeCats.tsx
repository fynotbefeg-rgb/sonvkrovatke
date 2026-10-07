// «Котята поясняют» в мем-формате: вырезанные фото-котята на белом/фото-фоне, крупный текст кусками, прыжки и попапы
import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { loadFont } from "@remotion/fonts";
import timing from "./catsTiming.json";

loadFont({ family: "Pangolin", url: staticFile("fonts/pangolin-cyr.woff2"), unicodeRange: "U+0400-045F, U+0490-0491, U+2116" });
loadFont({ family: "Pangolin", url: staticFile("fonts/pangolin-lat.woff2"), unicodeRange: "U+0000-00FF, U+2000-206F, U+20BD" });

export const MEME_FRAMES = timing.end;
const C = timing.cuts;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const src = (n: string) => staticFile(`cats2/${n}`);

type SpriteP = { img: string; x: number; y: number; h: number; at?: number; enter?: "jump" | "pop" | "drop"; flip?: boolean; bob?: boolean; shake?: number; f: number; z?: number; tilt?: number };
const Sprite: React.FC<SpriteP> = ({ img, x, y, h, at = 0, enter = "pop", flip, bob, shake = 0, f, z = 1, tilt = 0 }) => {
  const { fps } = useVideoConfig();
  const lf = f - at;
  if (lf < 0) return null;
  const k = spring({ frame: lf, fps, config: { damping: 9, stiffness: 160 } });
  let ty = 0, sx = 1, sy = 1;
  if (enter === "jump") { ty = -Math.sin(Math.min(1, lf / 12) * Math.PI) * 160 + (1 - Math.min(1, lf / 6)) * 300; const land = interpolate(lf, [11, 14, 19], [1, 0.82, 1], clamp); sy = land; sx = 2 - land; }
  else if (enter === "drop") { ty = (1 - k) * -900; }
  else { sx = sy = k; }
  const b = bob ? Math.abs(Math.sin(lf / 7)) * -18 : 0;
  const sq = bob ? 1 + Math.sin(lf / 3.5) * 0.015 : 1;
  const sh = shake ? Math.sin(lf * 1.9) * shake : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: z, transform: `translate(-50%, -100%) translate(${sh}px, ${ty + b}px) rotate(${tilt + sh * 0.3}deg) scale(${(flip ? -1 : 1) * sx}, ${sy * sq})`, transformOrigin: "50% 100%" }}>
      <Img src={src(img)} style={{ height: h, display: "block", filter: "drop-shadow(0 14px 18px rgba(0,0,0,.18))" }} />
    </div>
  );
};

// текст кусками, как у канала: белые буквы с тёмной тенью
type Chunk = [number, number, string, number?, number?]; // старт, конец, текст, y, размер
const Txt: React.FC<{ chunks: Chunk[]; f: number }> = ({ chunks, f }) => {
  const { fps } = useVideoConfig();
  return <>{chunks.map(([a, b, t, y = 260, size = 112], i) => {
    if (f < a || f >= b) return null;
    const k = spring({ frame: f - a, fps, config: { damping: 11, stiffness: 220 } });
    return <div key={i} style={{ position: "absolute", left: 30, right: 30, top: y, textAlign: "center", fontFamily: "Pangolin", fontSize: size, lineHeight: 1.0, color: "#fff", zIndex: 50,
      textTransform: "uppercase", transform: `scale(${0.6 + k * 0.4})`, opacity: Math.min(1, k * 2),
      WebkitTextStroke: "16px #34343a", paintOrder: "stroke fill", filter: "drop-shadow(0 10px 14px rgba(0,0,0,.3))" }}>{t}</div>;
  })}</>;
};

const Coins: React.FC<{ f: number; at: number; from: [number, number]; to: [number, number]; n?: number }> = ({ f, at, from, to, n = 6 }) => <>{Array.from({ length: n }, (_, i) => {
  const p = interpolate(f, [at + i * 5, at + i * 5 + 18], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  if (p <= 0 || p >= 1) return null;
  const x = from[0] + (to[0] - from[0]) * p, y = from[1] + (to[1] - from[1]) * p - Math.sin(p * Math.PI) * 260;
  return <Img key={i} src={src("coins.png")} style={{ position: "absolute", left: x - 70, top: y - 70, width: 140, zIndex: 40, transform: `rotate(${p * 540}deg)` }} />;
})}</>;

const Price: React.FC<{ f: number; at: number; x: number; y: number; old?: string; now: string; red?: boolean }> = ({ f, at, x, y, old, now, red }) => {
  const { fps } = useVideoConfig();
  if (f < at) return null;
  const k = spring({ frame: f - at, fps, config: { damping: 8 } });
  const strike = interpolate(f, [at + 14, at + 22], [0, 100], clamp);
  return <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${k}) rotate(-6deg)`, zIndex: 45, fontFamily: "Pangolin", background: red ? "#ff4d4d" : "#fff",
    color: red ? "#fff" : "#222", border: "5px solid #333", borderRadius: 22, padding: "8px 26px", fontSize: 78, display: "flex", gap: 20, alignItems: "center", boxShadow: "0 10px 20px rgba(0,0,0,.2)" }}>
    {old && <span style={{ position: "relative", opacity: .6 }}>{old}<span style={{ position: "absolute", left: -6, top: "50%", height: 7, width: `${strike}%`, background: "#e33", transform: "rotate(-12deg)" }} /></span>}
    <span>{now}</span></div>;
};

const Emoji: React.FC<{ f: number; at: number; x: number; y: number; e: string; size?: number }> = ({ f, at, x, y, e, size = 150 }) => {
  const { fps } = useVideoConfig();
  if (f < at) return null;
  const k = spring({ frame: f - at, fps, config: { damping: 7 } });
  return <div style={{ position: "absolute", left: x, top: y, fontSize: size, zIndex: 46, transform: `translate(-50%,-50%) scale(${k}) rotate(${Math.sin((f - at) / 5) * 8}deg)` }}>{e}</div>;
};

export const MemeCats: React.FC = () => {
  const f = useCurrentFrame();
  const si = Math.max(0, C.filter(c => c <= f).length - 1);
  const lf = f - C[si];
  const zoom = 1 + lf * 0.0006;
  const park = si === 2 || si === 5;
  let body: React.ReactNode = null;
  if (si === 0) body = <>
    <Sprite img="stand.png" x={300} y={1520} h={560} f={lf} at={4} />
    <Sprite img="stand.png" x={790} y={1520} h={560} f={lf} at={10} />
    <Sprite img="kr.png" x={300} y={1640} h={430} f={lf} at={26} enter="jump" bob z={3} />
    <Sprite img="kg.png" x={790} y={1640} h={430} f={lf} at={38} enter="jump" bob z={3} />
    <Price f={lf} at={60} x={300} y={1000} now="10₽" /><Price f={lf} at={66} x={790} y={1000} now="10₽" />
    <Txt f={lf} chunks={[[0, 42, "Два котёнка", 230], [42, 84, "открыли ларьки", 230], [84, 200, "с лимонадом", 230]]} />
  </>;
  if (si === 1) body = <>
    <Sprite img="stand.png" x={540} y={1500} h={700} f={lf} at={0} enter="pop" />
    <Sprite img="sign.png" x={540} y={870} h={260} f={lf} at={36} enter="drop" z={2} />
    <Sprite img="kg.png" x={540} y={1720} h={560} f={lf} at={6} enter="jump" bob z={3} />
    <Sprite img="cookie.png" x={850} y={1300} h={170} f={lf} at={70} enter="pop" z={4} />
    <Price f={lf} at={84} x={240} y={1150} old="10₽" now="7₽" />
    <Txt f={lf} chunks={[[0, 36, "А Пушок", 230], [36, 72, "повесил вывеску", 230], [72, 104, "снизил цену", 230], [104, 200, "и даёт печеньку!", 230, 100]]} />
  </>;
  if (si === 2) body = <>
    <Sprite img="stand.png" x={770} y={1430} h={580} f={lf} at={0} />
    <Sprite img="kg.png" x={770} y={1520} h={400} f={lf} at={0} bob z={3} />
    {[0, 1, 2, 3].map(i => <Sprite key={i} img={i % 2 ? "kr.png" : "kg.png"} x={140 + i * 120} y={1760 - i * 20} h={300 - i * 20} f={lf} at={14 + i * 9} enter="jump" bob z={5 - i} flip />)}
    <Coins f={lf} at={50} from={[260, 1500]} to={[770, 1150]} n={8} />
    <Txt f={lf} chunks={[[0, 50, "И все покупатели", 230, 104], [50, 200, "пошли к Пушку", 230]]} />
  </>;
  if (si === 3) body = <>
    <Sprite img="stand.png" x={540} y={1500} h={680} f={lf} at={0} enter="pop" />
    <Sprite img="kr.png" x={540} y={1700} h={600} f={lf} at={4} shake={lf > 50 ? 4 : 0} tilt={lf > 50 ? -6 : 0} z={3} />
    <Price f={lf} at={60} x={820} y={1100} now="0₽" red />
    <Emoji f={lf} at={70} x={250} y={950} e="🪰" size={110} />
    <Txt f={lf} chunks={[[0, 40, "А Рыжик", 230], [40, 80, "ничего не менял", 230], [80, 200, "и остался без денег", 230, 104]]} />
  </>;
  if (si === 4) body = <>
    <Sprite img="kr.png" x={540} y={1720} h={720} f={lf} at={0} bob={lf > 30} z={3} />
    <Emoji f={lf} at={22} x={540} y={760} e="💡" size={200} />
    <Emoji f={lf} at={60} x={210} y={1180} e="🧊" />
    <Emoji f={lf} at={70} x={870} y={1180} e="🍓" />
    <Emoji f={lf} at={80} x={210} y={1480} e="🌿" />
    <Emoji f={lf} at={90} x={870} y={1480} e="🍋" />
    <Txt f={lf} chunks={[[0, 40, "Но тут", 230], [40, 82, "он придумал", 230], [82, 200, "свой лимонад!", 230]]} />
  </>;
  if (si === 5) body = <>
    <Sprite img="stand.png" x={300} y={1450} h={520} f={lf} at={0} />
    <Sprite img="stand.png" x={790} y={1450} h={520} f={lf} at={0} />
    <Sprite img="kr.png" x={300} y={1560} h={400} f={lf} at={0} bob z={3} />
    <Sprite img="kg.png" x={790} y={1560} h={400} f={lf} at={0} bob z={3} />
    <Coins f={lf} at={10} from={[540, 1900]} to={[300, 1150]} n={5} />
    <Coins f={lf} at={14} from={[540, 1900]} to={[790, 1150]} n={5} />
    <Txt f={lf} chunks={[[0, 40, "Это и есть", 230], [40, 95, "конкуренция", 230, 126], [95, 200, "а выигрывает покупатель", 200, 100]]} />
  </>;
  return (
    <AbsoluteFill style={{ background: "#fff", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        {park && <Img src={src("park.jpg")} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        {body}
      </AbsoluteFill>
      <Audio src={staticFile("cats/cats.wav")} />
    </AbsoluteFill>
  );
};
