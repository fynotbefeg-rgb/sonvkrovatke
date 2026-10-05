import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { F } from "./FinReel";
import { sans } from "./theme";

// Аватар аккаунта «Деньги самозанятого»: 3 варианта, по кадру на каждый.
// Instagram обрезает фото в круг ~110 px, поэтому значок крупный и по центру
export const finAvatarCount = 3;

const line = { stroke: F.mint, strokeWidth: 9, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

// Рубль с галочкой: «налог в порядке»
const Ruble: React.FC = () => (
  <div style={{ position: "relative", width: 640, height: 640 }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 999,
        background: F.card,
        border: `14px solid ${F.mint}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: sans,
        fontWeight: 700,
        fontSize: 400,
        color: F.paper,
        lineHeight: 1,
        paddingBottom: 20,
      }}
    >
      ₽
    </div>
    <svg width="230" height="230" viewBox="0 0 100 100" style={{ position: "absolute", right: -30, bottom: -10 }}>
      <circle cx="50" cy="50" r="46" fill={F.mint} />
      <path d="M30 52l14 14 27-30" stroke={F.ink} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  </div>
);

// Чек с рублём
const Receipt: React.FC = () => (
  <svg width="700" height="700" viewBox="0 0 200 200">
    <path d="M52 22h96v156l-12-9-12 9-12-9-12 9-12-9-12 9-12-9-12 9z" fill={F.paper} />
    <text x="100" y="98" textAnchor="middle" fontFamily={sans} fontWeight={700} fontSize="64" fill={F.ink}>
      ₽
    </text>
    <path d="M72 122h56M72 142h36" stroke="#9fb0a8" strokeWidth="8" strokeLinecap="round" />
    <circle cx="146" cy="150" r="28" fill={F.mint} />
    <path d="M133 151l9 9 17-19" stroke={F.ink} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

// Листок календаря с 28-м — днём оплаты налога
const Calendar: React.FC = () => (
  <svg width="680" height="680" viewBox="0 0 200 200">
    <rect x="32" y="40" width="136" height="132" rx="22" fill={F.paper} />
    <path d="M32 62a22 22 0 0 1 22-22h92a22 22 0 0 1 22 22v14H32z" fill={F.mint} />
    <path d="M70 28v24M130 28v24" {...line} stroke={F.paper} strokeWidth="11" />
    <text x="100" y="152" textAnchor="middle" fontFamily={sans} fontWeight={700} fontSize="70" fill={F.ink}>
      28
    </text>
  </svg>
);

export const FinAvatar: React.FC = () => {
  const frame = useCurrentFrame();
  const icon = [<Ruble key="r" />, <Receipt key="c" />, <Calendar key="d" />][frame];
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 38%, ${F.card} 0%, ${F.bgSoft} 50%, ${F.bg} 100%)`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {icon}
    </AbsoluteFill>
  );
};

// Картинка для превью ссылки (og:image) 1200×630
export const FinOg: React.FC = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 700px 500px at 85% 10%, rgba(95,211,160,.18), transparent 70%), linear-gradient(180deg, ${F.bg}, ${F.bgSoft})`,
      padding: "70px 80px",
      fontFamily: sans,
      color: F.paper,
      justifyContent: "center",
    }}
  >
    <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: F.mint }}>Деньги самозанятого</div>
    <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.08, marginTop: 22, maxWidth: 820 }}>Правило трёх дат: чеки, налог и лимит без ошибок</div>
    <div style={{ display: "flex", gap: 18, marginTop: 40 }}>
      {["9-е · чеки", "12-е · квитанция", "28-е · налог"].map((t) => (
        <div key={t} style={{ background: F.card, borderRadius: 999, padding: "14px 26px", fontSize: 30, fontWeight: 600, color: F.mint }}>
          {t}
        </div>
      ))}
    </div>
  </AbsoluteFill>
);
