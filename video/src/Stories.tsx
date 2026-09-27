import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, sans, serif } from "./theme";

// Сториз 1080×1920 для хайлайтов. Один кадр композиции — одна сториз.
// Верх 250 px и низ 340 px оставлены пустыми: там интерфейс Instagram и стикер-ссылка
export type Story = { kicker?: string; title: string; items?: string[]; note?: string; sticker?: boolean };

export const memoStories: Story[] = [
  {
    kicker: "Знакомо?",
    title: "Уснул на руках. Наклоняетесь к кроватке — и он открывает глаза",
    note: "Дело не в кроватке. Первые 15 минут после засыпания сон поверхностный",
  },
  {
    kicker: "Бесплатная памятка",
    title: "7 движений, чтобы переложить малыша и не разбудить",
    items: [
      "Тест обмякшей руки: можно ли уже класть",
      "2 минуты подготовки до сна",
      "7 движений по порядку",
      "Правило трёх попыток",
      "6 ошибок, из-за которых он просыпается",
    ],
  },
  {
    kicker: "Для малышей 6–12 месяцев",
    title: "Забрать памятку",
    note: "Откроется сразу, нужна только почта. Попробуйте сегодня вечером",
    sticker: true,
  },
];

export const StoryFrame: React.FC<{ stories: Story[] }> = ({ stories }) => {
  const frame = useCurrentFrame();
  const s = stories[Math.min(frame, stories.length - 1)];
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 900px 700px at 80% 12%, rgba(217,154,63,.24), transparent 70%),
          linear-gradient(180deg, ${C.nightDeep} 0%, ${C.night} 55%, ${C.nightSoft} 100%)`,
        padding: "250px 96px 340px",
        justifyContent: "center",
      }}
    >
      {s.kicker ? (
        <div
          style={{
            fontFamily: sans,
            fontWeight: 500,
            fontSize: 38,
            letterSpacing: 5,
            textTransform: "uppercase",
            color: C.amber,
            marginBottom: 40,
          }}
        >
          {s.kicker}
        </div>
      ) : null}
      <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 96, lineHeight: 1.14, color: C.morning }}>
        {s.title}
      </div>
      {s.items ? (
        <div style={{ marginTop: 56 }}>
          {s.items.map((it) => (
            <div key={it} style={{ display: "flex", gap: 24, marginBottom: 26 }}>
              <div style={{ color: C.amber, fontFamily: sans, fontSize: 48, lineHeight: 1.2 }}>·</div>
              <div style={{ fontFamily: sans, fontSize: 48, lineHeight: 1.3, color: C.lamp }}>{it}</div>
            </div>
          ))}
        </div>
      ) : null}
      {s.note ? (
        <div style={{ marginTop: 52, fontFamily: sans, fontSize: 48, lineHeight: 1.35, color: C.lamp }}>{s.note}</div>
      ) : null}
      {s.sticker ? (
        <div
          style={{
            marginTop: 90,
            height: 150,
            border: `4px dashed rgba(217,154,63,.6)`,
            borderRadius: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: sans,
            fontSize: 38,
            color: C.mute,
          }}
        >
          ↓ сюда — стикер «Ссылка»
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
