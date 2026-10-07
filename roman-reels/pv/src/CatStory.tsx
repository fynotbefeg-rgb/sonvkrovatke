// Пилот «Как работает конкуренция»: история котят + касса, которая меняется по ходу сюжета
import React from "react";
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import "./Portfolio"; // шрифты Golos Text
import timing from "./catsTiming.json";

export const CATS_FRAMES = timing.end;
const C = timing.cuts;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const Y = "#ffd43b";

const SCENES = [
  { img: "c1", text: "Два котёнка открыли одинаковые ларьки с лимонадом", hl: ["одинаковые"], kb: [1.12, 1.0, 0, -40] },
  { img: "c2", text: "Пушок нарисовал яркую вывеску и добавил печеньку в подарок", hl: ["печеньку"], kb: [1.0, 1.12, -30, 20] },
  { img: "c3", text: "И к Пушку выстроилась очередь!", hl: ["очередь!"], kb: [1.15, 1.03, 30, 0] },
  { img: "c4", text: "А Рыжик ничего не менял… и остался без покупателей", hl: ["ничего", "не", "менял…"], kb: [1.0, 1.14, 0, 30] },
  { img: "c5", text: "Тогда Рыжик придумал лимонад со льдом и клубникой", hl: ["придумал"], kb: [1.14, 1.02, 0, -30] },
  { img: "c6", text: "Это и есть конкуренция: выигрывает тот, кто лучше для покупателя", hl: ["конкуренция:", "покупателя"], kb: [1.02, 1.12, 0, 0] },
];

// касса героев: [кадр, сумма]
const at = (s: number, d: number) => C[s] + d;
const MONEY = {
  r: [[0, 50], [at(4, 40), 50], [at(4, 52), 35], [at(5, 20), 35], [at(5, 70), 140]],
  p: [[0, 50], [at(1, 50), 50], [at(1, 62), 30], [at(2, 18), 30], [at(2, 90), 180], [at(5, 20), 180], [at(5, 70), 230]],
} as Record<string, number[][]>;
const DELTAS: { who: "r" | "p"; f: number; t: string; bad?: boolean }[] = [
  { who: "p", f: at(1, 50), t: "−20 на краску и печенье", bad: true },
  { who: "p", f: at(2, 18), t: "+150" },
  { who: "r", f: at(3, 30), t: "0 продаж", bad: true },
  { who: "r", f: at(4, 40), t: "−15 на лёд и клубнику", bad: true },
  { who: "r", f: at(5, 20), t: "+105" },
  { who: "p", f: at(5, 20), t: "+50" },
];
const money = (k: number[][], f: number) => {
  for (let i = 1; i < k.length; i++) if (f <= k[i][0])
    return Math.round(interpolate(f, [k[i - 1][0], k[i][0]], [k[i - 1][1], k[i][1]], { ...clamp, easing: Easing.inOut(Easing.cubic) }));
  return k[k.length - 1][1];
};

const Words: React.FC<{ text: string; hl: string[]; f: number }> = ({ text, hl, f }) => {
  const { fps } = useVideoConfig();
  return <>{text.split(" ").map((w, i) => {
    const k = spring({ frame: f - 4 - i * 3, fps, config: { damping: 12, stiffness: 200 } });
    const h = hl.includes(w);
    return <span key={i} style={{ display: "inline-block", margin: "0 10px 8px 0", opacity: k, transform: `translateY(${(1 - k) * 34}px) scale(${0.7 + k * 0.3}) rotate(${h ? -2 : 0}deg)`,
      background: h ? Y : "transparent", color: h ? "#1b1300" : "#fff", padding: h ? "0 12px" : 0, borderRadius: 12 }}>{w}</span>;
  })}</>;
};

const Wallet: React.FC<{ who: "r" | "p"; f: number }> = ({ who, f }) => {
  const v = money(MONEY[who], f);
  const name = who === "r" ? "Рыжик" : "Пушок", col = who === "r" ? "#2f6fe4" : "#2f9e57";
  const hit = DELTAS.filter(d => d.who === who).map(d => interpolate(f, [d.f, d.f + 6, d.f + 14], [0, 1, 0], clamp)).reduce((a, b) => Math.max(a, b), 0);
  return (
    <div style={{ position: "relative", background: "rgba(255,255,255,.95)", borderRadius: 26, padding: "14px 26px", display: "flex", alignItems: "center", gap: 16,
      boxShadow: "0 10px 30px rgba(0,0,0,.25)", transform: `scale(${1 + hit * 0.12})`, border: `5px solid ${col}` }}>
      <div style={{ fontSize: 34, fontWeight: 800, color: col }}>{name}</div>
      <div style={{ fontSize: 46, fontWeight: 900, color: "#1b1b1b", minWidth: 110, textAlign: "right" }}>{v}</div>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%,#ffe680,#f0a800)", border: "3px solid #c98a00", display: "grid", placeItems: "center", fontSize: 24, fontWeight: 900, color: "#8a5a00" }}>₽</div>
      {DELTAS.filter(d => d.who === who).map((d, i) => {
        const p = interpolate(f, [d.f, d.f + 50], [0, 1], clamp);
        if (p <= 0 || p >= 1) return null;
        return <div key={i} style={{ position: "absolute", left: "50%", bottom: "100%", transform: `translate(-50%, ${-10 - p * 90}px)`, opacity: interpolate(p, [0, .1, .75, 1], [0, 1, 1, 0]),
          whiteSpace: "nowrap", fontSize: 34, fontWeight: 900, color: "#fff", background: d.bad ? "#e5383b" : "#2fbf5b", borderRadius: 14, padding: "6px 16px" }}>{d.t}</div>;
      })}
    </div>
  );
};

export const CatStory: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const si = Math.max(0, C.filter(c => c <= f).length - 1);
  const s = SCENES[si], start = C[si], end = si < C.length - 1 ? C[si + 1] : CATS_FRAMES, lf = f - start;
  const p = (f - start) / (end - start);
  const sc = interpolate(p, [0, 1], [s.kb[0], s.kb[1]]) * (1 + interpolate(lf, [0, 8], [0.06, 0], clamp));
  const flash = interpolate(lf, [0, 5], [si ? 0.7 : 0, 0], clamp);
  const title = interpolate(f, [0, 8, 70, 80], [0, 1, 1, 0], clamp);
  const tk = spring({ frame: f, fps, config: { damping: 10 } });
  const finalK = si === 5 ? spring({ frame: lf - 75, fps, config: { damping: 12 } }) : 0;
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: "Golos Text" }}>
      <AbsoluteFill style={{ transform: `scale(${sc}) translate(${s.kb[2] * p}px, ${s.kb[3] * p}px)` }}>
        <Img src={staticFile(`cats/${s.img}.jpg`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      {/* затемнение под текстом */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0) 72%, rgba(0,0,0,.45) 100%)" }} />
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
      {/* заголовок темы */}
      <div style={{ position: "absolute", top: 120, left: 0, right: 0, textAlign: "center", opacity: title, transform: `scale(${0.6 + tk * 0.4})` }}>
        <span style={{ background: Y, color: "#1b1300", fontWeight: 900, fontSize: 50, padding: "12px 28px", borderRadius: 18, letterSpacing: 1 }}>КАК РАБОТАЕТ КОНКУРЕНЦИЯ?</span>
      </div>
      {/* текст истории */}
      <div key={si} style={{ position: "absolute", top: si === 0 ? 230 : 140, left: 60, right: 60, textAlign: "center", fontSize: 66, fontWeight: 900, lineHeight: 1.12,
        textShadow: "0 4px 18px rgba(0,0,0,.6)", opacity: finalK ? 1 - finalK : 1 }}>
        <Words text={s.text} hl={s.hl} f={lf} />
      </div>
      {/* кассы */}
      <div style={{ position: "absolute", bottom: 230, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 30 }}>
        <Wallet who="r" f={f} /><Wallet who="p" f={f} />
      </div>
      {/* вывод */}
      {si === 5 && finalK > 0 && (
        <div style={{ position: "absolute", top: 150, left: 70, right: 70, background: Y, borderRadius: 34, padding: "34px 36px", transform: `scale(${finalK}) rotate(${(1 - finalK) * -6}deg)`, color: "#1b1300", boxShadow: "0 20px 50px rgba(0,0,0,.35)" }}>
          <div style={{ fontSize: 34, fontWeight: 800, opacity: .7 }}>ВЫВОД</div>
          <div style={{ fontSize: 54, fontWeight: 900, lineHeight: 1.12, marginTop: 6 }}>Конкуренция заставляет делать лучше, а выигрывает покупатель 🍋</div>
        </div>
      )}
      <Audio src={staticFile("cats/cats.wav")} />
    </AbsoluteFill>
  );
};
