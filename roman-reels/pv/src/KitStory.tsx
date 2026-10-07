// «Как работает конкуренция» — живые котята (хромакей → прозрачный WebM) на белом фоне, озвучка, наклейки, ценники, монеты
import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { loadFont } from "@remotion/fonts";
import T from "./kitTiming.json";

loadFont({ family: "Pangolin", url: staticFile("fonts/pangolin-cyr.woff2"), unicodeRange: "U+0400-045F, U+0490-0491, U+2116" });
loadFont({ family: "Pangolin", url: staticFile("fonts/pangolin-lat.woff2"), unicodeRange: "U+0000-00FF, U+2000-206F, U+20BD" });

export const KIT_FRAMES = T.end;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// котёнок: кадр 608×1080 (у #17 квадрат), x — центр, y — верх кадра, h — высота кадра
const Kit: React.FC<{ id: number; x: number; y: number; h: number; at?: number; from?: number; flip?: boolean; shake?: number; slide?: number }> = ({ id, x, y, h, at = 0, from = 0, flip, shake = 0, slide = 0 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const k = spring({ frame: f - at, fps, config: { damping: 11, stiffness: 170 } });
  const sh = shake ? Math.sin(f * 1.8) * shake : 0;
  const w = id === 17 ? h : h * 608 / 1080;
  const sx = slide ? interpolate(f, [at, at + 40], [slide, 0], { ...clamp, easing: Easing.out(Easing.cubic) }) : 0;
  return (
    <div style={{ position: "absolute", left: x - w / 2 + sh + sx, top: y + (1 - k) * 120, width: w, height: h, transform: `scale(${(flip ? -1 : 1) * (0.5 + k * 0.5)}, ${0.5 + k * 0.5})`, transformOrigin: "50% 80%", zIndex: 5 }}>
      <Sequence from={at} layout="none">
        <OffthreadVideo src={staticFile(`kit/k${id}.webm`)} transparent muted startFrom={from} style={{ width: "100%", height: "100%" }} />
      </Sequence>
    </div>
  );
};

const Pic: React.FC<{ img: string; x: number; y: number; h: number; at?: number; drop?: boolean; z?: number }> = ({ img, x, y, h, at = 0, drop, z = 2 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const k = spring({ frame: f - at, fps, config: { damping: 9, stiffness: 160 } });
  return <div style={{ position: "absolute", left: x, top: y, zIndex: z, transform: `translate(-50%,-100%) translateY(${drop ? (1 - k) * -900 : 0}px) scale(${drop ? 1 : k})`, transformOrigin: "50% 100%" }}>
    <Img src={staticFile(`cats2/${img}`)} style={{ height: h, display: "block" }} /></div>;
};

const Price: React.FC<{ at: number; x: number; y: number; old?: string; now: string; red?: boolean; size?: number }> = ({ at, x, y, old, now, red, size = 76 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const k = spring({ frame: f - at, fps, config: { damping: 8 } });
  const strike = interpolate(f, [at + 12, at + 20], [0, 100], clamp);
  return <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${k}) rotate(-6deg)`, zIndex: 8, fontFamily: "Pangolin", background: red ? "#ff4d4d" : "#fff",
    color: red ? "#fff" : "#222", border: "5px solid #333", borderRadius: 22, padding: "6px 24px", fontSize: size, display: "flex", gap: 18, alignItems: "center", boxShadow: "0 10px 20px rgba(0,0,0,.18)" }}>
    {old && <span style={{ position: "relative", opacity: .55 }}>{old}<span style={{ position: "absolute", left: -6, top: "50%", height: 7, width: `${strike}%`, background: "#e33", transform: "rotate(-12deg)" }} /></span>}
    <span>{now}</span></div>;
};

const Emo: React.FC<{ at: number; x: number; y: number; e: string; size?: number }> = ({ at, x, y, e, size = 140 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const k = spring({ frame: f - at, fps, config: { damping: 7 } });
  return <div style={{ position: "absolute", left: x, top: y, fontSize: size, zIndex: 9, transform: `translate(-50%,-50%) scale(${k}) rotate(${Math.sin((f - at) / 5) * 8}deg)` }}>{e}</div>;
};

const Coins: React.FC<{ at: number; from: [number, number]; to: [number, number]; n?: number }> = ({ at, from, to, n = 6 }) => {
  const f = useCurrentFrame();
  return <>{Array.from({ length: n }, (_, i) => {
    const p = interpolate(f, [at + i * 5, at + i * 5 + 18], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
    if (p <= 0 || p >= 1) return null;
    const x = from[0] + (to[0] - from[0]) * p, y = from[1] + (to[1] - from[1]) * p - Math.sin(p * Math.PI) * 240;
    return <Img key={i} src={staticFile("cats2/coins.png")} style={{ position: "absolute", left: x - 60, top: y - 60, width: 120, zIndex: 10, transform: `rotate(${p * 540}deg)` }} />;
  })}</>;
};

const Tag: React.FC<{ t: string; x: number; y: number; at?: number }> = ({ t, x, y, at = 0 }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  if (f < at) return null;
  const k = spring({ frame: f - at, fps, config: { damping: 9 } });
  return <div style={{ position: "absolute", left: x, top: y, transform: `translate(-50%,-50%) scale(${k})`, zIndex: 9, fontFamily: "Pangolin", fontSize: 64, color: "#fff", background: "#ff8a1f", border: "5px solid #333", borderRadius: 20, padding: "2px 22px" }}>{t}</div>;
};

const CAP = ["Как работает конкуренция?", "Это Рыжик", "А это Пушок", "Одинаковые ларьки", "Покупатели у обоих", "Пушок захотел больше", "Цена ниже + печенька", "Все пошли к нему", "А Рыжик ни с чем", "Цена 5₽!", "А Пушок — 3₽!", "Оба без денег", "Не дешевле, а лучше", "Клубничный лимонад", "У каждого свои покупатели", "Это и есть конкуренция!"];
const Caption: React.FC<{ t: string; big?: boolean }> = ({ t, big }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig();
  const k = spring({ frame: f, fps, config: { damping: 11, stiffness: 220 } });
  return <div style={{ position: "absolute", left: 40, right: 40, top: big ? 300 : 210, textAlign: "center", fontFamily: "Pangolin", fontSize: big ? 130 : 104, lineHeight: 1.02, color: "#fff", zIndex: 20,
    textTransform: "uppercase", transform: `scale(${0.6 + k * 0.4})`, WebkitTextStroke: "16px #34343a", paintOrder: "stroke fill", filter: "drop-shadow(0 10px 14px rgba(0,0,0,.25))" }}>{t}</div>;
};

const L = 300, R = 780; // позиции ларьков
const scenes: React.ReactNode[] = [
  <><Kit id={4} x={540} y={640} h={1000} /><Kit id={32} x={250} y={900} h={760} at={30} flip from={20} /><Kit id={9} x={840} y={880} h={780} at={45} /></>,
  <><Kit id={31} x={540} y={560} h={1200} /><Tag t="Рыжик" x={540} y={1700} at={8} /></>,
  <><Kit id={31} x={290} y={760} h={900} from={40} /><Kit id={9} x={790} y={620} h={1100} at={2} /><Tag t="Пушок" x={790} y={1700} at={8} /></>,
  <><Pic img="stand.png" x={L} y={1560} h={600} /><Pic img="stand.png" x={R} y={1560} h={600} at={6} />
    <Kit id={31} x={L} y={920} h={820} at={10} from={80} /><Kit id={40} x={R} y={900} h={840} at={16} />
    <Price at={34} x={L} y={980} now="10₽" /><Price at={40} x={R} y={980} now="10₽" /></>,
  <><Pic img="stand.png" x={L} y={1500} h={540} /><Pic img="stand.png" x={R} y={1500} h={540} />
    <Kit id={31} x={L} y={900} h={760} from={120} /><Kit id={40} x={R} y={880} h={780} from={60} />
    <Kit id={17} x={540} y={1180} h={720} at={4} /><Coins at={24} from={[540, 1500]} to={[L, 1050]} n={4} /><Coins at={30} from={[540, 1500]} to={[R, 1050]} n={4} /></>,
  <><Kit id={40} x={540} y={420} h={1450} /><Emo at={22} x={830} y={760} e="😏" size={170} /><Emo at={36} x={240} y={820} e="💰" size={150} /></>,
  <><Pic img="stand.png" x={540} y={1520} h={700} /><Pic img="sign.png" x={540} y={900} h={250} drop at={10} z={3} />
    <Kit id={9} x={540} y={760} h={1000} at={2} from={30} /><Price at={34} x={230} y={1120} old="10₽" now="7₽" /><Pic img="cookie.png" x={870} y={1330} h={190} at={58} z={6} /></>,
  <><Pic img="stand.png" x={R} y={1460} h={560} /><Kit id={40} x={R} y={830} h={800} from={20} />
    <Kit id={18} x={330} y={980} h={700} at={2} slide={-500} /><Kit id={32} x={170} y={1080} h={600} at={14} slide={-500} />
    <Coins at={28} from={[260, 1450]} to={[R, 1050]} n={8} /></>,
  <><Pic img="stand.png" x={540} y={1520} h={700} /><Kit id={23} x={540} y={700} h={1080} from={30} /><Price at={20} x={820} y={1080} now="0₽" red /><Emo at={34} x={250} y={900} e="🪰" size={110} /></>,
  <><Kit id={31} x={540} y={520} h={1250} shake={6} from={200} /><Emo at={8} x={800} y={700} e="💢" size={170} /><Price at={30} x={260} y={1250} old="10₽" now="5₽" red size={86} /></>,
  <><Kit id={9} x={540} y={540} h={1250} from={90} /><Price at={10} x={810} y={1250} old="5₽" now="3₽" red size={86} /><Emo at={24} x={230} y={800} e="📉" size={150} /></>,
  <><Kit id={23} x={300} y={760} h={950} from={150} /><Kit id={20} x={790} y={760} h={950} at={4} />
    <Price at={22} x={300} y={1720} now="0₽" red /><Price at={26} x={790} y={1720} now="0₽" red /><Emo at={36} x={540} y={680} e="💸" size={150} /></>,
  <><Kit id={31} x={540} y={540} h={1250} from={300} /><Emo at={20} x={540} y={560} e="💡" size={200} /><Emo at={60} x={830} y={1000} e="✨" size={130} /></>,
  <><Pic img="stand.png" x={540} y={1520} h={700} /><Kit id={31} x={540} y={760} h={1000} from={360} />
    <Emo at={10} x={200} y={1000} e="🍓" /><Emo at={18} x={880} y={1000} e="🧊" /><Emo at={26} x={200} y={1280} e="🍋" /><Emo at={34} x={880} y={1280} e="🌿" />
    <Price at={46} x={540} y={760} now="🍓 15₽" size={70} /></>,
  <><Pic img="stand.png" x={L} y={1480} h={540} /><Pic img="stand.png" x={R} y={1480} h={540} />
    <Kit id={31} x={L} y={880} h={760} from={420} /><Kit id={40} x={R} y={860} h={780} from={100} />
    <Kit id={17} x={L + 40} y={1240} h={560} at={6} /><Kit id={32} x={R} y={1260} h={520} at={12} />
    <Coins at={20} from={[540, 1900]} to={[L, 1050]} n={5} /><Coins at={24} from={[540, 1900]} to={[R, 1050]} n={5} /></>,
  <><Kit id={47} x={330} y={640} h={1150} /><Kit id={4} x={780} y={760} h={1000} at={6} from={60} /><Emo at={20} x={540} y={1650} e="🍋" size={150} /></>,
];

export const KitStory: React.FC = () => {
  const S = T.starts, E = T.end;
  return (
    <AbsoluteFill style={{ background: "#fff", overflow: "hidden" }}>
      {scenes.map((sc, i) => {
        const from = i === 0 ? 0 : S[i] - 4;
        const to = i < S.length - 1 ? S[i + 1] - 4 : E;
        return <Sequence key={i} from={from} durationInFrames={to - from}>
          <AbsoluteFill>{sc}<Caption t={CAP[i]} big={i === 0 || i === 15} /></AbsoluteFill>
        </Sequence>;
      })}
      <Audio src={staticFile("kit/voice.wav")} />
    </AbsoluteFill>
  );
};
