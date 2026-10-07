import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { CUTS } from "./fvoCuts";
const F = 30;
const fr = (s: number) => Math.round(s * F);
const C = { gold: "#E3C186", gold2: "#F8E7C2", goldd: "#C9A266", green: "#024D2F", mut: "#DCE6DF" };
const font = `@font-face{font-family:G;src:url(${staticFile("fonts/golos-cyr.woff2")})}@font-face{font-family:G;src:url(${staticFile("fonts/golos-lat.woff2")});unicode-range:U+0000-00FF}`;
export const FVO_FRAMES = fr(61.0);
const ITEMS = ["Новые клиенты", "Новые партнёрства", "Выход на нужных людей", "Развитие личного бренда собственника", "Доверие к нему и компании", "Презентация продукта целевой аудитории", "Коллаборации между компаниями", "Новые точки продаж и роста", "Укрепление позиций на рынке"];
const IT = [13.96, 15.5, 17.12, 19.1, 21.72, 24.44, 27.16, 29.14, 32.08, 34.08];
const shadow = "0 4px 24px rgba(0,0,0,.6)";
const H: React.CSSProperties = { fontFamily: "G", color: "#fff", fontWeight: 800, textAlign: "center", padding: "0 70px", textShadow: shadow, textTransform: "uppercase", letterSpacing: -1 };
const P: React.CSSProperties = { ...H, textTransform: "none", fontWeight: 500, letterSpacing: 0 };
const Acc: React.FC<{ children: React.ReactNode }> = ({ children }) => <span style={{ background: `linear-gradient(90deg, ${C.gold2}, ${C.gold} 55%, ${C.goldd})`, WebkitBackgroundClip: "text", color: "transparent", textShadow: "none", filter: "drop-shadow(0 4px 18px rgba(0,0,0,.6))" }}>{children}</span>;
// d = absolute second the element appears; base = sequence start second
const In: React.FC<{ at?: number; base: number; children: React.ReactNode }> = ({ at, base, children }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const d = at === undefined ? 0 : fr(at - base);
  const s = spring({ frame: f - d, fps, config: { damping: 15, stiffness: 150 } });
  return <div style={{ opacity: interpolate(f - d, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: `translateY(${(1 - s) * 50}px)` }}>{children}</div>;
};
const Clip: React.FC<{ src: string; dur: number }> = ({ src, dur }) => { const f = useCurrentFrame();
  return <AbsoluteFill style={{ transform: `scale(${interpolate(f, [0, dur], [1, 1.08])})` }}><OffthreadVideo src={staticFile(`fvo/${src}.mp4`)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>; };
const Wave: React.FC<{ src: string; dur: number; flip?: boolean }> = ({ src, dur, flip }) => { const f = useCurrentFrame();
  return <AbsoluteFill style={{ transform: `scale(${interpolate(f, [0, dur], [1, 1.1])}) rotate(${interpolate(f, [0, dur], [0, 1.5])}deg) scaleX(${flip ? -1 : 1})` }}><Img src={staticFile(`formula/${src}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>; };
const Shade: React.FC<{ k?: number }> = ({ k = .75 }) => <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(1,22,12,${k * .55}) 0%, rgba(1,22,12,${k * .15}) 35%, rgba(1,22,12,${k * .4}) 55%, rgba(1,22,12,${k}) 100%)` }} />;
const Low: React.FC<{ children: React.ReactNode; bottom?: number }> = ({ children, bottom = 360 }) => <AbsoluteFill style={{ justifyContent: "flex-end", paddingBottom: bottom }}>{children}</AbsoluteFill>;
const Brand = () => <div style={{ position: "absolute", top: 165, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 34 }}><div style={{ width: 160, height: 3, background: C.goldd }} /><span style={{ fontFamily: "G", fontSize: 34, letterSpacing: 12, color: C.gold, fontWeight: 500, textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>ФОРМУЛА РОСТА</span><div style={{ width: 160, height: 3, background: C.goldd }} /></div>;
const Seq: React.FC<{ a: number; b: number; children: React.ReactNode }> = ({ a, b, children }) => <Sequence from={fr(a)} durationInFrames={fr(b) - fr(a)}>{children}</Sequence>;
const V: React.FC<{ a: number; b: number; src: string; k?: number }> = ({ a, b, src, k }) => <Seq a={a} b={b}><Clip src={src} dur={fr(b) - fr(a)} /><Shade k={k} /></Seq>;
export const FormulaVO: React.FC = () => {
  const f = useCurrentFrame(); const t = f / F;
  const ii = Math.max(0, Math.min(8, IT.findIndex((x, k) => t >= x && t < IT[k + 1])));
  return <AbsoluteFill style={{ background: "#000", fontFamily: "G" }}><style>{font}</style>
    <Audio src={staticFile("fvo/voice4.mp3")} />
    <Seq a={0.0} b={3.13}><Wave src="wave1" dur={fr(3.08)} /></Seq>
    {CUTS.map((c) => <V key={c.n} a={c.a} b={c.b} src={c.n} k={c.a >= 32.3 && c.a < 36.8 ? .85 : .75} />)}
    <Seq a={46.41} b={61.0}><Wave src="wave2" dur={fr(14.6)} flip /><AbsoluteFill style={{ background: "rgba(0,0,0,.3)" }} /></Seq>
    <Brand />
    <Seq a={0.0} b={3.13}><AbsoluteFill style={{ justifyContent: "center" }}>
      <In base={0.0} at={-2}><div style={{ ...H, fontSize: 96, lineHeight: 1.02 }}>Что получает<br />партнёр</div></In>
      <In base={0.0} at={-2}><div style={{ ...H, fontSize: 108, lineHeight: 1.02, marginTop: 10 }}><Acc>«Формулы<br />роста»?</Acc></div></In></AbsoluteFill></Seq>
    <Seq a={3.13} b={10.26}><Low>
      <In base={3.13}><div style={{ ...H, fontSize: 66, lineHeight: 1.1 }}>Возможность решить</div></In>
      <In base={3.13} at={4.14}><div style={{ ...H, fontSize: 84, lineHeight: 1.04, marginTop: 10 }}><Acc>конкретную задачу бизнеса</Acc></div></In>
      <In base={3.13} at={6.06}><div style={{ ...P, fontSize: 46, lineHeight: 1.25, marginTop: 24 }}>через прямой контакт с людьми,<br />которые принимают решения</div></In></Low></Seq>
    <Seq a={10.26} b={13.96}><Low>
      <In base={10.26}><div style={{ ...H, fontSize: 76, lineHeight: 1.05 }}><Acc>Предприниматель&shy;ское окружение</Acc></div></In>
      <In base={10.26} at={12.31}><div style={{ ...H, fontSize: 66, marginTop: 18 }}>и новые возможности</div></In></Low></Seq>
    <Seq a={13.96} b={34.08}><Low bottom={330}>{(() => { const loc = f - fr(IT[ii]); return <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontFamily: "G", fontSize: 150, fontWeight: 800, lineHeight: 1 }}><Acc>{String(ii + 1).padStart(2, "0")}</Acc></div>
      <div key={ii} style={{ ...H, fontSize: ITEMS[ii].length > 26 ? 64 : 76, lineHeight: 1.08, marginTop: 10, transform: `translateY(${interpolate(loc, [0, 7], [40, 0], { extrapolateRight: "clamp" })}px)`, opacity: interpolate(loc, [0, 5], [0, 1], { extrapolateRight: "clamp" }) }}>{ITEMS[ii]}</div>
      <div style={{ display: "flex", gap: 12, marginTop: 46 }}>{ITEMS.map((_, k) => <div key={k} style={{ width: k === ii ? 54 : 16, height: 16, borderRadius: 8, background: k <= ii ? C.gold : "#ffffff55" }} />)}</div></div>; })()}</Low></Seq>
    <Seq a={34.08} b={39.29}><Low>
      <In base={34.08}><div style={{ ...H, fontSize: 66, lineHeight: 1.15 }}>Партнёрство —<br />это не просто</div></In>
      <In base={34.08} at={37.37}><div style={{ ...H, fontSize: 66, lineHeight: 1.2, color: C.mut }}>
        {["присутствие", "на мероприятии"].map((x, k) => <div key={x}><span style={{ position: "relative", display: "inline-block" }}>{x}<span style={{ position: "absolute", left: -10, right: -10, top: "52%", height: 9, background: C.gold, borderRadius: 5, transformOrigin: "left", transform: `scaleX(${interpolate(f - fr(32.3), [fr(3.3) + k * 8, fr(3.3) + 10 + k * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })})` }} /></span></div>)}</div></In></Low></Seq>
    <Seq a={39.29} b={46.41}><Low>
      <In base={39.29}><div style={{ ...H, fontSize: 62, lineHeight: 1.12 }}>Это возможность<br />занять своё место</div></In>
      <In base={39.29} at={41.38}><div style={{ ...H, fontSize: 56, lineHeight: 1.08, marginTop: 14 }}><Acc>в сильном предпринимательском окружении</Acc></div></In>
      <In base={39.29} at={43.64}><div style={{ ...P, fontSize: 46, marginTop: 20 }}>и использовать его для роста бизнеса</div></In></Low></Seq>
    <Seq a={46.41} b={61.0}><AbsoluteFill style={{ justifyContent: "center", padding: "0 20px" }}>
      <In base={46.41}><div style={{ ...H, fontSize: 64, lineHeight: 1.12 }}>Расскажите нам<br />о вашей цели —</div></In>
      <In base={46.41} at={48.64}><div style={{ ...H, fontSize: 70, lineHeight: 1.06, marginTop: 18 }}><Acc>соберём формат<br />партнёрства,</Acc></div></In>
      <div style={{ marginTop: 40 }}>{[["который усилит ваш бренд", 51.0], ["откроет доступ к нужным людям", 52.6], ["создаст новые коммерческие возможности", 54.46]].map(([x, at]) =>
        <In key={x as string} base={46.41} at={at as number}><div style={{ ...P, fontSize: 44, lineHeight: 1.3, marginTop: 10 }}><span style={{ color: C.gold, fontFamily: "DejaVu Sans" }}>✓ </span>{x}</div></In>)}</div>
      <In base={46.41} at={56.9}><div style={{ margin: "50px auto 0", background: `linear-gradient(90deg, ${C.gold2}, ${C.gold})`, color: C.green, fontWeight: 800, fontSize: 48, padding: "28px 60px", borderRadius: 100, width: "fit-content", boxShadow: "0 10px 40px rgba(227,193,134,.35)", fontFamily: "G" }}>Написать в директ <span style={{ fontFamily: "DejaVu Sans" }}>→</span></div></In>
    </AbsoluteFill></Seq>
  </AbsoluteFill>;
};
