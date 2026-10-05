import React from "react";
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Rise, clamp, ease, sans } from "./theme";

// Рилсы для темы «Деньги самозанятого»: без видеофона, движущаяся инфографика
// (календарь, ставки, чек, сравнение). Палитра своя, шрифт — Golos Text
export const F = {
  bg: "#0d1a16",
  bgSoft: "#14261f",
  card: "#1b3129",
  paper: "#f4f1ea",
  ink: "#10201a",
  mint: "#5fd3a0",
  coral: "#ff7a5c",
  mute: "#8fa39a",
};

type Base = { duration: number };
export type FinScene = Base &
  (
    | { kind: "hook"; kicker?: string; lines: string[]; sub?: string; size?: number }
    | { kind: "calendar"; days: [number, string][] }
    | { kind: "rates"; rows: [string, string, string][]; note: string }
    | { kind: "receipt"; title: string; lines: [string, string][]; total: [string, string] }
    | { kind: "compare"; left: [string, string, string]; right: [string, string, string] }
    | { kind: "statement"; title: string; body?: string }
    | { kind: "cta"; kicker: string; title: string; word: string; note: string }
  );

export const finDuration = (scenes: FinScene[]) => scenes.reduce((s, x) => s + x.duration, 0);

const SOURCE = "Правила: npd.nalog.ru · октябрь 2026";

const Frame: React.FC<{ duration: number; first?: boolean; source?: boolean; children: React.ReactNode }> = ({
  duration,
  first = false,
  source = false,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = first
    ? interpolate(frame, [duration - 10, duration], [1, 0], clamp)
    : interpolate(frame, [0, 8, duration - 10, duration], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity, justifyContent: "center", padding: "0 100px 140px", fontFamily: sans, color: F.paper }}>
      {children}
      {source ? (
        <div style={{ position: "absolute", left: 100, bottom: 170, fontSize: 32, color: F.mute }}>{SOURCE}</div>
      ) : null}
    </AbsoluteFill>
  );
};

const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: 5, textTransform: "uppercase", color: F.mint, marginBottom: 36 }}>
    {children}
  </div>
);

const Big: React.FC<{ size?: number; children: React.ReactNode }> = ({ size = 112, children }) => (
  <div style={{ fontSize: size, fontWeight: 600, lineHeight: 1.08, letterSpacing: -2 }}>{children}</div>
);

const Hook: React.FC<Extract<FinScene, { kind: "hook" }> & { first: boolean }> = ({ duration, kicker, lines, sub, size, first }) => (
  <Frame duration={duration} first={first}>
    {kicker ? <Kicker>{kicker}</Kicker> : null}
    <Big size={size}>
      {lines.map((l, i) =>
        first ? (
          <div key={l}>{l}</div>
        ) : (
          <Rise key={l} delay={i * 6}>
            {l}
          </Rise>
        ),
      )}
    </Big>
    {sub ? (
      <Rise delay={first ? 8 : 26} style={{ marginTop: 48 }}>
        <div style={{ fontSize: 54, fontWeight: 500, lineHeight: 1.3, color: F.mint }}>{sub}</div>
      </Rise>
    ) : null}
  </Frame>
);

// Сетка месяца, нужные числа загораются по очереди, под сеткой — что в этот день
const Calendar: React.FC<Extract<FinScene, { kind: "calendar" }>> = ({ duration, days }) => {
  const frame = useCurrentFrame();
  const step = Math.floor((duration - 30) / days.length);
  const active = Math.min(days.length - 1, Math.max(0, Math.floor((frame - 12) / step)));
  const lit = (d: number) => days.findIndex(([n]) => n === d);
  return (
    <Frame duration={duration} source>
      <Kicker>Каждый месяц</Kicker>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 14 }}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
          const idx = lit(d);
          const on = idx >= 0 && idx <= active && frame >= 12 + idx * step;
          const now = idx === active && on;
          return (
            <div
              key={d}
              style={{
                height: 104,
                borderRadius: 22,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 44,
                fontWeight: on ? 700 : 500,
                background: now ? F.mint : on ? F.card : "rgba(255,255,255,.04)",
                color: now ? F.ink : on ? F.mint : F.mute,
                transform: `scale(${now ? 1.08 : 1})`,
              }}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 56, minHeight: 300 }}>
        {days.map(([d, text], i) =>
          i === active ? (
            <Rise key={d}>
              <div style={{ fontSize: 96, fontWeight: 700, color: F.mint }}>{d}-е</div>
              <div style={{ fontSize: 58, fontWeight: 500, lineHeight: 1.25, marginTop: 12 }}>{text}</div>
            </Rise>
          ) : null,
        )}
      </div>
    </Frame>
  );
};

// Карточки ставок: сначала обычная ставка, потом она зачёркивается и появляется ставка с бонусом
const Rates: React.FC<Extract<FinScene, { kind: "rates" }>> = ({ duration, rows, note }) => {
  const frame = useCurrentFrame();
  const cut = Math.floor(duration * 0.5);
  const strike = interpolate(frame, [cut, cut + 12], [0, 1], { ...clamp, easing: ease });
  return (
    <Frame duration={duration} source>
      {rows.map(([who, rate, bonus], i) => (
        <Rise key={who} delay={i * 10} style={{ marginBottom: 36 }}>
          <div style={{ background: F.card, borderRadius: 40, padding: "44px 56px" }}>
            <div style={{ fontSize: 48, fontWeight: 500, lineHeight: 1.2, color: F.mute }}>{who}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 56, marginTop: 8 }}>
              <div style={{ position: "relative", fontSize: 130, fontWeight: 700, color: strike > 0.5 ? F.mute : F.paper }}>
                {rate}
                <div style={{ position: "absolute", left: -8, right: -8, top: "52%", height: 10, background: F.coral, transform: `scaleX(${strike})`, transformOrigin: "left" }} />
              </div>
              <div style={{ fontSize: 130, fontWeight: 700, color: F.mint, opacity: strike }}>{bonus}</div>
            </div>
          </div>
        </Rise>
      ))}
      <div style={{ opacity: strike, marginTop: 24, fontSize: 52, fontWeight: 500, lineHeight: 1.3, color: F.mint }}>{note}</div>
    </Frame>
  );
};

// Светлый «чек» со строками, итог появляется последним
const Receipt: React.FC<Extract<FinScene, { kind: "receipt" }>> = ({ duration, title, lines, total }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 16, stiffness: 110 } });
  return (
    <Frame duration={duration} source>
      <div style={{ background: F.paper, color: F.ink, borderRadius: 36, padding: "60px 64px", transform: `translateY(${(1 - pop) * 120}px)`, boxShadow: "0 30px 80px rgba(0,0,0,.4)" }}>
        <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: 4, textTransform: "uppercase", color: "#5b6b64", marginBottom: 36 }}>{title}</div>
        {lines.map(([k, v], i) => (
          <Rise key={k} delay={10 + i * 12}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 50, padding: "18px 0", borderBottom: "3px dashed #d4d9d2" }}>
              <span>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          </Rise>
        ))}
        <Rise delay={14 + lines.length * 12}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 64, fontWeight: 700, marginTop: 30, color: "#1f7a52" }}>
            <span>{total[0]}</span>
            <span>{total[1]}</span>
          </div>
        </Rise>
      </div>
    </Frame>
  );
};

// Две колонки: [заголовок, пояснение, итог]. Правая колонка — отрицательная
const Compare: React.FC<Extract<FinScene, { kind: "compare" }>> = ({ duration, left, right }) => {
  const col = (c: [string, string, string], good: boolean, delay: number) => (
    <Rise delay={delay} style={{ flex: 1 }}>
      <div style={{ background: F.card, borderRadius: 36, padding: "48px 40px", height: 760, display: "flex", flexDirection: "column", border: `4px solid ${good ? F.mint : F.coral}` }}>
        <div style={{ fontSize: 120, fontWeight: 700, color: good ? F.mint : F.coral, lineHeight: 1 }}>{good ? "✓" : "✕"}</div>
        <div style={{ fontSize: 56, fontWeight: 700, marginTop: 36, lineHeight: 1.15 }}>{c[0]}</div>
        <div style={{ fontSize: 42, color: F.mute, marginTop: 20, lineHeight: 1.3 }}>{c[1]}</div>
        <div style={{ marginTop: "auto", fontSize: 46, fontWeight: 600, lineHeight: 1.25 }}>{c[2]}</div>
      </div>
    </Rise>
  );
  return (
    <Frame duration={duration}>
      <div style={{ display: "flex", gap: 32 }}>
        {col(left, true, 0)}
        {col(right, false, 22)}
      </div>
    </Frame>
  );
};

const Statement: React.FC<Extract<FinScene, { kind: "statement" }>> = ({ duration, title, body }) => (
  <Frame duration={duration}>
    <Rise>
      <Big size={100}>{title}</Big>
    </Rise>
    {body ? (
      <Rise delay={16} style={{ marginTop: 44 }}>
        <div style={{ fontSize: 60, fontWeight: 500, lineHeight: 1.3, color: F.mint }}>{body}</div>
      </Rise>
    ) : null}
  </Frame>
);

// Финал: превью таблицы и кодовое слово для комментария
const Cta: React.FC<Extract<FinScene, { kind: "cta" }>> = ({ duration, kicker, title, word, note }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 30, fps, config: { damping: 12, stiffness: 120 } });
  const rows = [
    ["Октябрь", "18 699 ₽", "711 ₽"],
    ["Оплатить до", "28.11", ""],
    ["До лимита", "2,38 млн ₽", ""],
  ];
  return (
    <Frame duration={duration}>
      <Rise>
        <Kicker>{kicker}</Kicker>
      </Rise>
      <Rise delay={6}>
        <Big size={88}>{title}</Big>
      </Rise>
      <Rise delay={14} style={{ marginTop: 48 }}>
        <div style={{ background: F.paper, color: F.ink, borderRadius: 28, overflow: "hidden", fontSize: 40 }}>
          {rows.map(([a, b, c], i) => (
            <div key={a} style={{ display: "flex", padding: "22px 36px", background: i % 2 ? "#e9efe9" : F.paper }}>
              <span style={{ flex: 1.3 }}>{a}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{b}</span>
              <span style={{ flex: 0.6, color: "#1f7a52", fontWeight: 600 }}>{c}</span>
            </div>
          ))}
        </div>
      </Rise>
      <div style={{ marginTop: 56, alignSelf: "flex-start", transform: `scale(${pop})`, transformOrigin: "left center", background: F.mint, color: F.ink, fontWeight: 700, fontSize: 52, padding: "30px 52px", borderRadius: 999 }}>
        Напишите «{word}»
        <br />в комментариях
      </div>
      <Rise delay={44} style={{ marginTop: 32 }}>
        <div style={{ fontSize: 44, color: F.mute }}>{note}</div>
      </Rise>
    </Frame>
  );
};

const Body: React.FC<{ spec: FinScene; first: boolean }> = ({ spec, first }) => {
  switch (spec.kind) {
    case "hook":
      return <Hook {...spec} first={first} />;
    case "calendar":
      return <Calendar {...spec} />;
    case "rates":
      return <Rates {...spec} />;
    case "receipt":
      return <Receipt {...spec} />;
    case "compare":
      return <Compare {...spec} />;
    case "statement":
      return <Statement {...spec} />;
    case "cta":
      return <Cta {...spec} />;
  }
};

const Bg: React.FC = () => {
  const frame = useCurrentFrame();
  const x = 70 + 8 * Math.sin(frame / 40);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 900px 800px at ${x}% 12%, rgba(95,211,160,.16), transparent 70%),
          linear-gradient(180deg, ${F.bg} 0%, ${F.bgSoft} 100%)`,
      }}
    />
  );
};

export const FinReel: React.FC<{ scenes: FinScene[] }> = ({ scenes }) => {
  let from = 0;
  return (
    <AbsoluteFill>
      <Bg />
      {scenes.map((spec, i) => {
        const start = from;
        from += spec.duration;
        return (
          <Sequence key={i} from={start} durationInFrames={spec.duration}>
            <Body spec={spec} first={i === 0} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
