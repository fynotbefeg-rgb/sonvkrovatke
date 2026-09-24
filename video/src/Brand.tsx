import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, sans } from "./theme";

// Аватар профиля и обложки хайлайтов в цветах сайта

const Night: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(circle at 50% 40%, ${C.nightSoft} 0%, ${C.night} 55%, ${C.nightDeep} 100%)`,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {children}
  </AbsoluteFill>
);

// Кроватка под месяцем: читается даже в кружке 110 px
export const Avatar: React.FC = () => (
  <Night>
    <div
      style={{
        position: "absolute",
        width: 900,
        height: 900,
        borderRadius: 999,
        background: "radial-gradient(circle at 60% 30%, rgba(217,154,63,.28), transparent 60%)",
      }}
    />
    <svg width="760" height="760" viewBox="0 0 200 200">
      <path d="M128 30a34 34 0 1 0 30 50a28 28 0 1 1 -30 -50z" fill={C.amber} />
      <g stroke={C.lamp} strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M34 108v66M166 108v66M34 124h132M34 164h132" />
        <path d="M60 124v40M86 124v40M114 124v40M140 124v40" strokeWidth="5" />
      </g>
    </svg>
  </Night>
);

const stroke = { stroke: C.amber, strokeWidth: 6, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

const icons: Record<string, React.ReactNode> = {
  // лист с загнутым углом
  memo: (
    <g {...stroke}>
      <path d="M62 30h56l24 24v116H62z" />
      <path d="M118 30v24h24M78 84h48M78 106h48M78 128h32" />
    </g>
  ),
  // лестница ступеней
  method: (
    <g {...stroke}>
      <path d="M40 160h28v-24h28v-24h28v-24h28v-24h28" />
      <path d="M40 176h140" />
    </g>
  ),
  // раскрытая книга
  guide: (
    <g {...stroke}>
      <path d="M100 58c-18-12-42-14-62-10v108c20-4 44-2 62 10c18-12 42-14 62-10V48c-20-4-44-2-62 10z" />
      <path d="M100 58v108" />
    </g>
  ),
  // вопрос в облачке
  faq: (
    <g {...stroke}>
      <path d="M40 60a20 20 0 0 1 20-20h80a20 20 0 0 1 20 20v56a20 20 0 0 1-20 20H92l-30 26v-26h-2a20 20 0 0 1-20-20z" />
      <path d="M86 76a14 14 0 1 1 20 12c-5 3-6 6-6 11" />
      <circle cx="100" cy="116" r="2.5" fill={C.amber} />
    </g>
  ),
  // сердце
  reviews: (
    <g {...stroke}>
      <path d="M100 160C62 134 40 112 40 84a30 30 0 0 1 60-8a30 30 0 0 1 60 8c0 28-22 50-60 76z" />
    </g>
  ),
  // крест в круге
  doctor: (
    <g {...stroke}>
      <circle cx="100" cy="100" r="62" />
      <path d="M100 72v56M72 100h56" strokeWidth="10" />
    </g>
  ),
};

export const highlights: { id: string; label: string }[] = [
  { id: "memo", label: "Памятка" },
  { id: "method", label: "Метод" },
  { id: "guide", label: "Руководство" },
  { id: "faq", label: "Вопросы" },
  { id: "reviews", label: "Отзывы" },
  { id: "doctor", label: "К врачу" },
];

// Обложка хайлайта 1080×1920: Instagram показывает круг по центру,
// подпись ниже круга видна только внутри сториз
export const HighlightCover: React.FC = () => {
  const frame = useCurrentFrame();
  const h = highlights[Math.min(frame, highlights.length - 1)];
  return (
    <Night>
      <div
        style={{
          width: 820,
          height: 820,
          borderRadius: 999,
          background: `radial-gradient(circle at 50% 35%, ${C.nightSoft}, ${C.night})`,
          border: `4px solid rgba(217,154,63,.35)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="520" height="520" viewBox="0 0 200 200">
          {icons[h.id]}
        </svg>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 360,
          fontFamily: sans,
          fontWeight: 500,
          fontSize: 56,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: C.lamp,
        }}
      >
        {h.label}
      </div>
    </Night>
  );
};
