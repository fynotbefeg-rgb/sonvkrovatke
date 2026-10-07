// Анимированный рекламный баннер (4 слайда) поверх вертикального видео — для TikTok / Reels / Shorts
import React from "react";
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from "remotion";
import "./Portfolio"; // подгружает Golos Text

export const BANNER_FRAMES = 300;
const V = "#6b4dff", LIME = "#d4ff3f", INK = "#15122b";
const S0 = 24, SL = 60; // старт баннера, длина слайда
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Icon: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: `linear-gradient(140deg, ${V}, #9b6bff)`, display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(107,77,255,.45)" }}>
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="13" stroke="#fff" strokeWidth="3.4" />
      <path d="M14 22c2 3 10 3 12 0" stroke={LIME} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="15.5" cy="16.5" r="2" fill="#fff" /><circle cx="24.5" cy="16.5" r="2" fill="#fff" />
    </svg>
  </div>
);

const Word: React.FC<{ t: string; f: number; d: number; hl?: boolean }> = ({ t, f, d, hl }) => {
  const { fps } = useVideoConfig();
  const k = spring({ frame: f - d, fps, config: { damping: 14, stiffness: 180 } });
  return <span style={{ display: "inline-block", marginRight: 16, transform: `translateY(${(1 - k) * 40}px) scale(${0.8 + k * 0.2})`, opacity: k,
    background: hl ? LIME : "transparent", padding: hl ? "0 12px" : 0, borderRadius: 12 }}>{t}</span>;
};
const Line: React.FC<{ s: string; f: number; d0?: number; hl?: string[] }> = ({ s, f, d0 = 0, hl = [] }) => (
  <>{s.split(" ").map((w, i) => <Word key={i} t={w} f={f} d={d0 + i * 3} hl={hl.includes(w)} />)}</>
);

// слайды получают локальный кадр f
const Slide1: React.FC<{ f: number }> = ({ f }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 30 }}>
    <div style={{ fontSize: 120, transform: `rotate(${Math.sin(f / 6) * 8}deg)` }}>🤔</div>
    <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.12, color: INK }}><Line s="Не знаешь, какой уход подходит твоей коже?" f={f} hl={["коже?"]} /></div>
  </div>
);

const Slide2: React.FC<{ f: number }> = ({ f }) => {
  const scan = (f * 2.6) % 220;
  const done = interpolate(f, [30, 40], [0, 1], clamp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
      <div style={{ width: 170, height: 250, borderRadius: 30, background: INK, padding: 10, flexShrink: 0, position: "relative", overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 22, background: "linear-gradient(180deg,#f6d7cb,#e9b9a8)", position: "relative", overflow: "hidden" }}>
          <svg viewBox="0 0 100 140" style={{ position: "absolute", inset: 0 }}><ellipse cx="50" cy="66" rx="28" ry="36" fill="#f2c4b2" stroke="#c98d79" strokeWidth="1.4" />
            <circle cx="40" cy="60" r="2.6" fill="#5a3a30" /><circle cx="60" cy="60" r="2.6" fill="#5a3a30" /><path d="M42 82q8 6 16 0" stroke="#a5604f" strokeWidth="2" fill="none" strokeLinecap="round" />
            {[[34, 74], [66, 72], [52, 44]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={interpolate(f, [12 + i * 5, 18 + i * 5], [0, 7], clamp)} fill="none" stroke={V} strokeWidth="2" />)}</svg>
          <div style={{ position: "absolute", left: 0, right: 0, top: scan, height: 4, background: LIME, boxShadow: `0 0 18px ${LIME}`, opacity: 1 - done }} />
          <div style={{ position: "absolute", left: 10, right: 10, bottom: 12, background: V, color: "#fff", borderRadius: 10, fontSize: 18, fontWeight: 800, textAlign: "center", padding: "6px 0",
            transform: `scale(${done})` }}>Готово ✓</div>
        </div>
      </div>
      <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.14, color: INK }}>
        <Line s="Сфоткай лицо — ИИ подберёт уход за 30 секунд" f={f} hl={["30", "секунд"]} />
      </div>
    </div>
  );
};

const Slide3: React.FC<{ f: number }> = ({ f }) => {
  const n = Math.round(interpolate(f, [4, 34], [0, 500], { ...clamp, easing: Easing.out(Easing.cubic) }));
  return (
    <div style={{ textAlign: "center", color: INK }}>
      <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
        {[0, 1, 2, 3, 4].map(i => { const k = interpolate(f, [4 + i * 4, 12 + i * 4], [0, 1], clamp);
          return <span key={i} style={{ fontSize: 78, color: "#ffb21e", transform: `scale(${k}) rotate(${(1 - k) * -90}deg)`, display: "inline-block" }}>★</span>; })}
      </div>
      <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: -3, marginTop: 4 }}>{n} 000+</div>
      <div style={{ fontSize: 42, fontWeight: 700, opacity: .75, marginTop: -4 }}>девушек уже нашли свой уход</div>
    </div>
  );
};

const Slide4: React.FC<{ f: number }> = ({ f }) => {
  const { fps } = useVideoConfig();
  const k = spring({ frame: f, fps, config: { damping: 12 } });
  const pulse = 1 + Math.max(0, Math.sin((f - 20) / 5)) * 0.05 * (f > 20 ? 1 : 0);
  const tap = interpolate(f, [34, 40, 46], [0, 1, 0], clamp);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 34 }}>
      <div style={{ transform: `scale(${k}) rotate(${(1 - k) * -30}deg)` }}><Icon size={170} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 58, fontWeight: 900, color: INK, letterSpacing: -1 }}>Skinly</div>
        <div style={{ fontSize: 30, fontWeight: 600, color: "#6a6680", marginTop: 2 }}>ИИ-подбор ухода за кожей</div>
        <div style={{ marginTop: 22, background: V, color: "#fff", fontSize: 40, fontWeight: 800, borderRadius: 999, padding: "22px 0", textAlign: "center",
          transform: `scale(${pulse * (1 - tap * 0.06)})`, boxShadow: `0 10px 30px rgba(107,77,255,.45), 0 0 0 ${tap * 14}px rgba(212,255,63,.7)` }}>Скачать бесплатно</div>
      </div>
    </div>
  );
};

const SLIDES = [Slide1, Slide2, Slide3, Slide4];

export const AppBanner: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inK = spring({ frame: f - S0, fps, config: { damping: 13, stiffness: 140 } });
  const t = f - S0;
  const idx = Math.max(0, Math.min(3, Math.floor(t / SL)));
  // переход: в последние 8 кадров слайда — уезд влево, новый въезжает справа
  const local = t - idx * SL;
  const progress = interpolate(t, [0, SL * 4 - 4], [0, 1], clamp);
  const Cur = SLIDES[idx];
  const enter = idx > 0 ? interpolate(local, [0, 9], [1, 0], { ...clamp, easing: Easing.out(Easing.back(1.4)) }) : 0;
  const squash = idx > 0 ? interpolate(local, [0, 5, 12], [1, 0.94, 1], clamp) : 1;
  const Prev = idx > 0 ? SLIDES[idx - 1] : null;
  const prevX = interpolate(local, [0, 9], [0, -1], clamp);
  const zoom = interpolate(f, [0, BANNER_FRAMES], [1.05, 1.15]);
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: "Golos Text" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <OffthreadVideo src={staticFile("clips/sk1.mp4")} startFrom={30} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </AbsoluteFill>
      {/* имитация интерфейса площадки: правая колонка и подпись */}
      <div style={{ position: "absolute", right: 34, bottom: 520, display: "flex", flexDirection: "column", gap: 44, alignItems: "center", opacity: .9 }}>
        {["♥", "💬", "↗"].map((s, i) => <div key={i} style={{ width: 84, height: 84, borderRadius: "50%", background: "rgba(0,0,0,.28)", color: "#fff", fontSize: 40, display: "grid", placeItems: "center" }}>{s}</div>)}
      </div>
      <div style={{ position: "absolute", left: 44, bottom: 150, color: "#fff", fontSize: 34, fontWeight: 600, textShadow: "0 2px 10px rgba(0,0,0,.5)" }}>
        <b>@beauty.daily</b><div style={{ fontWeight: 400, fontSize: 30, opacity: .9, marginTop: 6 }}>мой вечерний уход за 5 минут ✨</div>
      </div>
      {/* баннер */}
      {t >= 0 && (
        <div style={{ position: "absolute", left: 44, right: 140, bottom: 300, transformOrigin: "50% 100%",
          transform: `translateY(${(1 - inK) * 260}px) scale(${(0.7 + inK * 0.3) * squash})`, opacity: Math.min(1, inK * 1.5) }}>
          <div style={{ position: "absolute", top: -26, left: 26, background: LIME, color: INK, fontWeight: 800, fontSize: 24, borderRadius: 10, padding: "6px 14px", zIndex: 2, letterSpacing: 1 }}>РЕКЛАМА · Skinly</div>
          <div style={{ background: "rgba(255,255,255,.96)", borderRadius: 40, height: 380, padding: "44px 40px 36px", position: "relative", overflow: "hidden", boxShadow: "0 24px 60px rgba(20,10,60,.35)" }}>
            {Prev && <div style={{ position: "absolute", inset: "44px 40px 36px", transform: `translateX(${prevX * 110}%)`, opacity: 1 + prevX }}><Prev f={SL + local} /></div>}
            <div style={{ position: "absolute", inset: "44px 40px 36px", display: "flex", alignItems: "center", transform: `translateX(${enter * 110}%)` }}>
              <div style={{ width: "100%" }}><Cur f={local} /></div>
            </div>
            {/* индикатор слайдов */}
            <div style={{ position: "absolute", left: 40, right: 40, bottom: 18, display: "flex", gap: 10 }}>
              {[0, 1, 2, 3].map(i => <div key={i} style={{ flex: 1, height: 7, borderRadius: 4, background: "rgba(21,18,43,.12)", overflow: "hidden" }}>
                <div style={{ height: "100%", background: V, width: `${interpolate(progress * 4 - i, [0, 1], [0, 100], clamp)}%` }} /></div>)}
            </div>
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
