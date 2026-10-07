import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig, staticFile } from "remotion";
import { PT } from "./partnerTiming";
const F = 30;
const font = `@font-face{font-family:G;src:url(${staticFile("fonts/golos-cyr.woff2")})}@font-face{font-family:G;src:url(${staticFile("fonts/golos-lat.woff2")});unicode-range:U+0000-00FF}`;
const C = { gold: "#E3C186", gold2: "#F8E7C2", goldd: "#C9A266", green: "#024D2F" };
export const PARTNER_FRAMES = Math.round(PT.total * F);
const fr = (s: number) => Math.round(s * F);
const seg = (i: number) => PT.segs[i] as any;
const acc: React.CSSProperties = { background: `linear-gradient(90deg, ${C.gold2}, ${C.gold} 55%, ${C.goldd})`, WebkitBackgroundClip: "text", color: "transparent" };
const H: React.CSSProperties = { fontFamily: "G", fontWeight: 800, textTransform: "uppercase", letterSpacing: -1.5, lineHeight: 1.02, color: "#fff", textAlign: "center", textShadow: "0 4px 26px rgba(0,0,0,.6)" };
const In: React.FC<{ d?: number; children: React.ReactNode }> = ({ d = 0, children }) => {
  const f = useCurrentFrame(); const { fps } = useVideoConfig(); const s = spring({ frame: f - d, fps, config: { damping: 15, stiffness: 140 } });
  return <div style={{ opacity: interpolate(f - d, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: `translateY(${(1 - s) * 50}px)` }}>{children}</div>;
};
const Clip: React.FC<{ name: string; dur: number }> = ({ name, dur }) => { const f = useCurrentFrame();
  return <AbsoluteFill style={{ transform: `scale(${interpolate(f, [0, dur], [1, 1.07])})` }}><OffthreadVideo src={staticFile(`partner/${name}.mp4`)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>; };
const Wave: React.FC<{ src: string; dur: number; flip?: boolean }> = ({ src, dur, flip }) => { const f = useCurrentFrame();
  return <AbsoluteFill style={{ transform: `scale(${interpolate(f, [0, dur], [1, 1.1])}) rotate(${interpolate(f, [0, dur], [0, 1.5])}deg) scaleX(${flip ? -1 : 1})` }}><Img src={staticFile(`formula/${src}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>; };
// subtitles: split segment text into chunks
const SMALL = new Set(["а","и","в","с","не","что","на","о","к","по","для","или","мы","чем","как","это"]);
const chunks = (t: string) => { const raw = t.split(" "); const w: string[] = [];
  for (const x of raw) { if (x === "—" && w.length) w[w.length - 1] += "\u00A0—"; else w.push(x); }
  const out: string[][] = []; let cur: string[] = [];
  const len = (a: string[]) => a.join(" ").length;
  for (const x of w) { if (cur.length && len([...cur, x]) > 30) { const carry: string[] = []; while (cur.length > 1 && SMALL.has(cur[cur.length - 1].toLowerCase())) carry.unshift(cur.pop()!); out.push(cur); cur = [...carry]; }
    cur.push(x); if (/[.?!:»]$/.test(x) && len(cur) > 12) { out.push(cur); cur = []; } }
  if (cur.length) out.push(cur); return out.map((c) => c.join(" ").replace(/-/g, "\u2011")); };
const SUBS: { a: number; b: number; t: string }[] = [];
PT.segs.forEach((s: any) => { if ([0, 5, 18, 19].includes(s.i)) return; const cs = chunks(s.text); const tot = cs.reduce((n, c) => n + c.length, 0); let t = s.start;
  cs.forEach((c) => { const d = s.dur * c.length / tot; SUBS.push({ a: t, b: t + d, t: c }); t += d; }); });
const Sub: React.FC = () => { const f = useCurrentFrame(); const t = f / F; const c = SUBS.find((s) => t >= s.a && t < s.b); if (!c) return null;
  return <div key={c.t} style={{ position: "absolute", left: 80, right: 80, bottom: 330, textAlign: "center", opacity: interpolate(t - c.a, [0, .12], [0, 1], { extrapolateRight: "clamp" }) }}>
    <span style={{ fontFamily: "G", fontSize: 54, fontWeight: 800, lineHeight: 1.32, color: "#fff", background: "rgba(2,30,17,.8)", padding: "6px 20px", borderRadius: 16, boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone", boxShadow: `inset 0 -4px 0 ${C.goldd}` }}>{c.t}</span></div>; };
const Shade = () => <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(1,22,12,.55) 0%, rgba(1,22,12,.05) 30%, rgba(1,22,12,.1) 55%, rgba(1,22,12,.75) 100%)" }} />;
const Num: React.FC<{ n: string; t: string }> = ({ n, t }) => <div style={{ position: "absolute", top: 300, left: 0, right: 0 }}><In><div style={{ ...H, fontSize: 200, ...acc, textShadow: "none", filter: "drop-shadow(0 6px 24px rgba(0,0,0,.6))" }}>{n}</div></In><In d={6}><div style={{ ...H, fontSize: 64, marginTop: 6 }}>{t}</div></In></div>;
export const PartnerReel: React.FC = () => {
  const f = useCurrentFrame();
  const S = (i: number, el: React.ReactNode) => { const s = seg(i); return <Sequence from={fr(s.from)} durationInFrames={fr(s.to) - fr(s.from)}>{el}</Sequence>; };
  const s11 = seg(11);
  return <AbsoluteFill style={{ background: "#000", fontFamily: "G" }}><style>{font}</style>
    <Audio src={staticFile("partner/voice.wav")} />
    {PT.clips.map((c: any) => <Sequence key={c.name} from={fr(c.from)} durationInFrames={fr(c.to) - fr(c.from)}><Clip name={c.name} dur={fr(c.to) - fr(c.from)} /><Shade /></Sequence>)}
    {S(0, <><Wave src="wave1" dur={fr(seg(0).to)} /><AbsoluteFill style={{ justifyContent: "center", padding: "0 70px" }}>
      <In><div style={{ ...H, fontSize: 100 }}>Почему мы не берём в партнёры</div></In><In d={10}><div style={{ ...H, fontSize: 116, marginTop: 14, ...acc, textShadow: "none" }}>всех подряд?</div></In></AbsoluteFill></>)}
    {S(5, <><Wave src="wave2" dur={fr(seg(5).to - seg(5).from)} flip /><AbsoluteFill style={{ justifyContent: "center" }}><In><div style={{ ...H, fontSize: 92 }}>Наши</div></In><In d={6}><div style={{ ...H, fontSize: 132, ...acc, textShadow: "none" }}>критерии</div></In></AbsoluteFill></>)}
    {S(6, <Num n="01" t="Сильный продукт" />)}
    {S(7, <Num n="02" t="Репутация и сервис" />)}
    {S(8, <Num n="03" t="Готовность к диалогу" />)}
    {S(11, <div style={{ position: "absolute", top: 380, left: 0, right: 0 }}><In><div style={{ ...H, fontSize: 70, position: "relative", display: "inline-block", width: "100%" }}>«Повесьте наш<br />логотип где-нибудь»
      <div style={{ position: "absolute", left: "12%", right: "12%", top: "50%", height: 12, borderRadius: 6, background: C.gold, transformOrigin: "left", transform: `scaleX(${interpolate(f - fr(s11.from), [18, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}) rotate(-4deg)` }} /></div></In></div>)}
    {S(16, <div style={{ position: "absolute", top: 260, left: 70, right: 70, display: "flex", flexWrap: "wrap", gap: 18, justifyContent: "center" }}>
      {["Прямой контакт", "Презентация продукта", "Новые знакомства", "Целевые контакты", "Доверие аудитории", "Новые партнёрства"].map((x, k) => <In key={x} d={[8, 70, 105, 150, 188, 228][k]}><div style={{ fontFamily: "G", fontWeight: 700, fontSize: 40, color: C.green, background: `linear-gradient(90deg, ${C.gold2}, ${C.gold})`, padding: "16px 30px", borderRadius: 60, boxShadow: "0 8px 30px rgba(0,0,0,.4)" }}>{x}</div></In>)}</div>)}
    {S(18, <><Wave src="wave1" dur={fr(seg(18).to - seg(18).from)} flip /><AbsoluteFill style={{ background: "rgba(0,0,0,.25)" }} /><AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <In><div style={{ ...H, fontSize: 64, textTransform: "none", fontWeight: 500, letterSpacing: 0, lineHeight: 1.25 }}>Нужны не показы логотипа,<br />а реальные контакты?</div></In>
      <In d={236}><div style={{ ...H, fontSize: 70, marginTop: 70 }}>Напишите нам</div></In>
      <In d={250}><div style={{ margin: "34px auto 0", width: "fit-content", fontFamily: "G", fontWeight: 800, fontSize: 84, color: C.green, background: `linear-gradient(90deg, ${C.gold2}, ${C.gold})`, padding: "26px 70px", borderRadius: 120, boxShadow: "0 14px 60px rgba(227,193,134,.45)" }}>ПАРТНЁР</div></In></AbsoluteFill></>)}
    {S(19, <><Wave src="wave2" dur={fr(seg(19).to - seg(19).from)} /><AbsoluteFill style={{ background: "rgba(0,0,0,.3)" }} /><AbsoluteFill style={{ justifyContent: "center", padding: "0 80px" }}>
      <In><div style={{ ...H, fontSize: 76 }}>Посмотрим,<br />подходим ли мы<br />друг другу</div></In>
      <In d={20}><div style={{ ...H, fontSize: 46, textTransform: "none", fontWeight: 500, letterSpacing: 0, marginTop: 40, lineHeight: 1.3 }}>и какой формат интеграции решит<br /><span style={{ ...acc, fontWeight: 800 }}>именно вашу задачу</span></div></In>
      <In d={40}><div style={{ margin: "70px auto 0", width: "fit-content", fontFamily: "G", fontWeight: 800, fontSize: 52, color: C.green, background: `linear-gradient(90deg, ${C.gold2}, ${C.gold})`, padding: "22px 54px", borderRadius: 100 }}>Директ → «ПАРТНЁР»</div></In></AbsoluteFill></>)}
    <div style={{ position: "absolute", top: 165, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 34 }}><div style={{ width: 160, height: 3, background: C.goldd }} /><span style={{ fontFamily: "G", fontSize: 34, letterSpacing: 12, color: C.gold, fontWeight: 500, textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>ФОРМУЛА РОСТА</span><div style={{ width: 160, height: 3, background: C.goldd }} /></div>
    <Sub />
  </AbsoluteFill>;
};
