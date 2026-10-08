import React from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import "./Portfolio"; // шрифты Golos Text
import WORDS from "./romanWords.json";

// Рилсы Романа (шаблон v2): вставки привязаны к фразам расшифровки, контент — на весь экран без кружка
const FPS = 25; // как у роликов HeyGen — без дублей кадров
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CL = "#d97757";
const GPT = "#10a37f";
const FONT = "Golos Text";

type W = [string, number, number];
// якорь: секунды или фраза из расшифровки (+ сдвиг); несколько вариантов фразы через массив
type A = number | { p: string | string[]; d?: number; end?: boolean };
type Mark = { t0: number; t1: number; x: number; y: number; w: number; h: number };
type Base = { from: A; to: A };
export type Ins = Base & (
  | { kind: "phone"; src: string; trim: number; rate?: number; full: [number, number, number][]; marks?: Mark[] }
  | { kind: "web"; img: string; h: number; pan: [number, number, number][]; marks?: Mark[] }
  | { kind: "big"; top: string; big: string; bottom?: string }
  | { kind: "compare"; yes: string[]; no: string[] }
  | { kind: "flow" }
  | { kind: "mcflow"; word: string; reply: string; btn: string }
  | { kind: "approve" }
  | { kind: "cta"; l1: string; chip: string; l2: string }
  | { kind: "chat"; app: "whatsapp" | "instagram" | "avito" | "wb" | "telegram"; q: string; a: string; stars?: number; pre?: string; badge?: string }
);
export type Topic = { dir: string; hookIns?: Record<string, Ins[]>; body: Ins[]; plates: Record<string, string>; hookFull?: boolean; jumps?: Record<string, number[]> };
export type RVersion = { topic: string; hook: "h1" | "h2" | "h3"; cap?: "word" | "phrase" };

// ---------- темы ----------
const S3_FULL: [number, number, number][] = [[0, 980, 1.0], [2.6, 980, 1.05], [3.3, 700, 1.1], [6, 700, 1.1], [8, 1150, 1.1]];
const S4_FULL: [number, number, number][] = [[0, 980, 1.0], [2.6, 980, 1.05], [3.3, 820, 1.1], [4.4, 820, 1.1], [5.6, 1300, 1.1]];
const S2_FULL: [number, number, number][] = [[0, 900, 1.0], [2.6, 900, 1.05], [3.3, 820, 1.1], [5.6, 820, 1.1], [7.0, 1100, 1.1], [9.0, 1350, 1.1]];

export const TOPICS: Record<string, Topic> = {
  kanaly: {
    dir: "rr/kanaly",
    plates: { h1: "Ты теряешь часы на ответы клиентам 😳", h2: "Нейросеть ответит клиентам за тебя 🔥", h3: "5 мест, где переписку ведёт нейросеть 🤖" },
    body: [
      { kind: "chat", app: "whatsapp", from: { p: ["первое"], d: 1.3 }, to: { p: ["второе"], d: -0.1 }, q: "Здравствуйте! Есть запись на субботу?", a: "Здравствуйте! В субботу свободно 12:00 и 15:30. Записать вас?" },
      { kind: "chat", app: "instagram", from: { p: ["второе"], d: 1.1 }, to: { p: ["третье"], d: -0.1 }, pre: "комментарий: ЦЕНА", q: "ЦЕНА", a: "Привет! Держи прайс и ссылку на запись 👇 Если остались вопросы — пиши, отвечу." },
      { kind: "chat", app: "avito", from: { p: ["третье"], d: 1.1 }, to: { p: ["четвертое"], d: -0.1 }, q: "Ещё продаётся? Доставка в Казань есть?", a: "Да, в наличии! В Казань — 2–3 дня через Авито Доставку. Оформить?" },
      { kind: "chat", app: "wb", from: { p: ["четвертое"], d: 1.2 }, to: { p: ["и пятое", "пятое"], d: -0.1 }, q: "Подскажите, на рост 170 какой размер брать?", a: "Здравствуйте! На рост 170 подойдёт M — модель идёт в размер. Если любите посвободнее, берите L." },
      { kind: "chat", app: "telegram", from: { p: ["и пятое", "пятое"], d: 1.2 }, to: { p: ["главное правило"], d: -0.1 }, q: "Сколько стоит консультация?", a: "Консультация 60 минут — 5 000 ₽. Удобно во вторник или в четверг?" },
      { kind: "big", from: { p: ["главное правило"] }, to: { p: ["напиши в комментариях"], d: -0.1 }, top: "типовое — нейросеть,", big: "сложное — тебе", bottom: "жалобы и крупные заказы" },
      { kind: "cta", from: { p: ["напиши в комментариях"] }, to: 999, l1: "Где автоматизировать переписку?", chip: "WhatsApp · Instagram<br/>Авито · WB · Telegram", l2: "следующее видео — про это" },
    ],
  },
  manychat: {
    dir: "rr/manychat",
    hookFull: true,
    plates: { h1: "Напиши «БОТ» — и смотри в директ 🪄", h2: "Как блогеры отвечают всем в директ 🤖", h3: "Автоответ в директ за 4 шага ⚡" },
    body: [
      { kind: "mcflow", from: { p: ["схема простая"] }, to: { p: ["как настроить"], d: -0.1 }, word: "ПРАЙС", reply: "Привет! Держи прайс 👇", btn: "Открыть прайс" },
      { kind: "chat", app: "instagram", from: 0.2, to: { p: ["схема простая"], d: -0.1 }, pre: "комментарий: ПРАЙС", q: "ПРАЙС", a: "Привет! Держи прайс и ссылку на запись 👇 Если остались вопросы — пиши.", badge: "автоответ ManyChat" },
      { kind: "big", from: { p: ["первое"] }, to: { p: ["второе"], d: -0.1 }, top: "шаг 1", big: "проф. аккаунт", bottom: "бизнес или автор" },
      { kind: "big", from: { p: ["второе"] }, to: { p: ["третье"], d: -0.1 }, top: "шаг 2", big: "вход через Meta", bottom: "пароль никому не передаёшь" },
      { kind: "big", from: { p: ["третье"] }, to: { p: ["четвертое"], d: -0.1 }, top: "шаг 3", big: "кодовое слово", bottom: "шаблон «ответ на комментарий»" },
      { kind: "big", from: { p: ["четвертое"] }, to: { p: ["включи"], d: -0.1 }, top: "шаг 4", big: "сообщение в директ", bottom: "со ссылкой или кнопкой" },
      { kind: "big", from: { p: ["включи"] }, to: { p: ["и важно"], d: -0.1 }, top: "включи и проверь", big: "со 2-го аккаунта" },
      { kind: "big", from: { p: ["и важно"] }, to: { p: ["совет"], d: -0.1 }, top: "ответ приходит", big: "сразу", bottom: "а не через 3 часа" },
      { kind: "big", from: { p: ["совет"] }, to: { p: ["а дальше"], d: -0.1 }, top: "кодовое слово —", big: "«ПРАЙС»", bottom: "одно и короткое" },
      { kind: "big", from: { p: ["а дальше"] }, to: { p: ["напиши в комментариях"], d: -0.1 }, top: "дальше —", big: "нейросеть", bottom: "в следующем видео" },
      { kind: "cta", from: { p: ["напиши в комментариях"] }, to: 999, l1: "Напиши в комментах", chip: "БОТ", l2: "пришлю инструкцию в директ" },
    ],
  },
  otvety: {
    dir: "rr/otvety",
    plates: { h1: "Нейросеть отвечает клиентам за тебя ⚡", h2: "Ответ за час = ×7 к сделке 📈", h3: "3 уровня ИИ-ответов клиентам 🤖" },
    body: [
      { kind: "big", from: 0.3, to: { p: ["три уровня"], d: 0.9, end: true }, top: "ответ в течение часа", big: "×7", bottom: "шанс дойти до разговора" },
      { kind: "phone", from: { p: ["уровень первый"] }, to: { p: ["поэтому уровень второй", "уровень второй"], d: -0.1 }, src: "s3.mp4", trim: 1.0, rate: 1.0, full: S3_FULL,
        marks: [{ t0: 7.6, t1: 30, x: 20, y: 850, w: 1040, h: 540 }] },
      { kind: "phone", from: { p: ["поэтому уровень второй", "уровень второй"] }, to: { p: ["уровень третий"], d: -0.1 }, src: "s4.mp4", trim: 0.3, rate: 0.8, full: S4_FULL },
      { kind: "flow", from: { p: ["уровень третий"] }, to: { p: ["а для звонков", "для звонков"], d: -0.1 } },
      { kind: "big", from: { p: ["а для звонков", "для звонков"] }, to: { p: ["и фишка", "фишка"], d: -0.1 }, top: "для звонков —", big: "ИИ-робот", bottom: "звонит и записывает сам" },
      { kind: "phone", from: { p: ["и фишка", "фишка"] }, to: { p: ["главное правило"], d: -0.1 }, src: "s2.mp4", trim: 2.5, rate: 1.4, full: S2_FULL },
      { kind: "big", from: { p: ["главное правило"] }, to: { p: ["напиши в комментариях"], d: -0.1 }, top: "главное правило", big: "ИИ пишет", bottom: "ты проверяешь и отправляешь" },
      { kind: "cta", from: { p: ["напиши в комментариях"] }, to: 999, l1: "Напиши в комментах", chip: "где общаешься<br/>с клиентами", l2: "разберу в следующем видео" },
    ],
  },
  startups: {
    dir: "rr/startups",
    hookFull: true,
    plates: { h1: "Claude бесплатно на год 🎁", h2: "Год Claude Team — бесплатно 🔥", h3: "Claude на год: кто пройдёт? 🤔" },
    body: [
      { kind: "web", from: 0.2, to: { p: ["что дают"], d: -0.1 }, img: "ai2/web_hero.jpg", h: 2350, pan: [[0, 900, 1.0], [3, 1000, 1.05]] },
      { kind: "web", from: { p: ["что дают"] }, to: { p: ["кто может подать"], d: -0.1 }, img: "ai2/web_benefits.jpg", h: 1700, pan: [[0, 800, 1.15], [6, 800, 1.25]] },
      { kind: "web", from: { p: ["кто может подать"] }, to: { p: ["и инвестиции", "инвестиции не обязательны"], d: -0.1 }, img: "ai2/faq_who.jpg", h: 1850, pan: [[0, 500, 1.1], [5, 520, 1.15]],
        marks: [{ t0: 0.4, t1: 30, x: 40, y: 394, w: 1000, h: 146 }] },
      { kind: "web", from: { p: ["и инвестиции", "инвестиции не обязательны"] }, to: { p: ["что нужно"], d: -0.1 }, img: "ai2/faq_vc.jpg", h: 1850, pan: [[0, 450, 1.1], [5, 470, 1.15]],
        marks: [{ t0: 0.4, t1: 30, x: 40, y: 250, w: 1000, h: 300 }] },
      { kind: "web", from: { p: ["что нужно"] }, to: { p: ["решение часто", "решение"], d: -0.1 }, img: "ai2/faq_who.jpg", h: 1850, pan: [[0, 520, 1.15], [5, 540, 1.2]],
        marks: [{ t0: 0.3, t1: 30, x: 40, y: 528, w: 1000, h: 212 }] },
      { kind: "web", from: { p: ["решение часто", "решение"] }, to: { p: ["а теперь то", "о чём часто молчат"], d: -0.1 }, img: "ai2/faq_review.jpg", h: 1850, pan: [[0, 450, 1.1], [4, 470, 1.15]],
        marks: [{ t0: 0.3, t1: 30, x: 40, y: 423, w: 1000, h: 292 }] },
      { kind: "big", from: { p: ["а теперь то", "о чём часто молчат"] }, to: { p: ["программа работает только", "работает только"], d: -0.1 }, top: "а теперь то,", big: "о чём молчат", bottom: "🤫" },
      { kind: "web", from: { p: ["программа работает только", "работает только"] }, to: { p: ["например"], d: -0.1 }, img: "ai2/web_countries.jpg", h: 3400, pan: [[0, 1100, 1.15], [4, 2600, 1.15]] },
      { kind: "compare", from: { p: ["например"] }, to: { p: ["полный список"], d: -0.1 }, yes: ["Казахстан", "Грузия"], no: ["Россия", "Беларусь"] },
      { kind: "web", from: { p: ["полный список"] }, to: { p: ["обходить"], d: -0.1 }, img: "ai2/web_countries.jpg", h: 3400, pan: [[0, 2500, 1.1], [3, 2700, 1.1]],
        marks: [{ t0: 0.3, t1: 30, x: 20, y: 2618, w: 560, h: 82 }] },
      { kind: "big", from: { p: ["обходить"] }, to: { p: ["кредиты на api", "кредиты"], d: -0.1 }, top: "обходить не советую", big: "бан аккаунта", bottom: "вместе с подпиской" },
      { kind: "big", from: { p: ["кредиты на api", "кредиты"] }, to: { p: ["а если в тебя", "если в тебя"], d: -0.1 }, top: "кредиты API действуют", big: "6 месяцев", bottom: "только через Claude Console" },
      { kind: "big", from: { p: ["а если в тебя", "если в тебя"] }, to: { p: ["напиши в комментариях"], d: -0.1 }, top: "если вложился фонд-партнёр", big: "+$100K", bottom: "дополнительно на API" },
      { kind: "cta", from: { p: ["напиши в комментариях"] }, to: 999, l1: "Напиши в комментах", chip: "какой у тебя<br/>продукт", l2: "разберу, как описать в заявке" },
    ],
  },
};

// ---------- поиск фраз в расшифровке ----------
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9×%]+/g, " ").trim();
const flat = (words: W[]) => {
  const out: { w: string; s: number; e: number }[] = [];
  for (const [w, s, e] of words) for (const piece of norm(w).split(" ")) if (piece) out.push({ w: piece, s, e });
  return out;
};
const resolve = (a: A, words: W[], dur: number): number => {
  if (typeof a === "number") return Math.min(a, dur);
  const fw = flat(words);
  for (const ph of Array.isArray(a.p) ? a.p : [a.p]) {
    const q = norm(ph).split(" ");
    for (let i = 0; i + q.length <= fw.length; i++) {
      if (q.every((x, k) => fw[i + k].w.startsWith(x))) return Math.max(0, (a.end ? fw[i + q.length - 1].e : fw[i].s) + (a.d ?? 0));
    }
  }
  return -1; // фраза не найдена — вставка пропускается
};

// ---------- оформление ----------
const Logo: React.FC<{ who: "gpt" | "cl"; size: number }> = ({ who, size }) => (
  <div style={{ width: size, height: size, borderRadius: size * 0.28, background: who === "gpt" ? GPT : CL, display: "grid", placeItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
    <Img src={staticFile(`ai/${who === "gpt" ? "openai" : "claude"}-w.svg`)} style={{ width: size * 0.62, height: size * 0.62 }} />
  </div>
);
const Card: React.FC<{ p: number; children: React.ReactNode; h?: number }> = ({ p, children, h = 420 }) => (
  <div style={{ position: "absolute", left: 50, right: 150, top: 840 - h, height: h, borderRadius: 30, overflow: "hidden", background: "#111", opacity: p }}>{children}</div>
);
const Marks: React.FC<{ marks?: Mark[]; t: number }> = ({ marks, t }) => (
  <>{(marks ?? []).map((m, i) => {
    const o = interpolate(t, [m.t0, m.t0 + 0.3, m.t1 - 0.2, m.t1], [0, 1, 1, 0], clamp);
    return <div key={i} style={{ position: "absolute", left: m.x, top: m.y, width: m.w, height: m.h, border: "8px solid #ffd400", borderRadius: 20, opacity: o, boxShadow: "0 0 0 4000px rgba(0,0,0,.35)" }} />;
  })}</>
);
// контент на весь экран: точка фокуса держится на высоте 760 px кадра
const FullLayer: React.FC<{ p: number; fy: number; sc: number; h: number; children: React.ReactNode; bg?: string }> = ({ p, fy, sc, h, children, bg = "#1f1e1d" }) => (
  <AbsoluteFill style={{ background: bg, opacity: p, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: h, transformOrigin: `540px ${fy}px`, transform: `translate(0px, ${760 - fy}px)` }}>{children}</div>{/* без зума: экран всегда целиком по ширине */}
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 480, background: "linear-gradient(180deg, rgba(20,20,20,0) 0%, rgba(20,20,20,.7) 60%)" }} />
  </AbsoluteFill>
);
const keyf = (k: [number, number, number][], t: number) => {
  const e = { ...clamp, easing: Easing.inOut(Easing.cubic) };
  return [interpolate(t, k.map((x) => x[0]), k.map((x) => x[1]), e), interpolate(t, k.map((x) => x[0]), k.map((x) => x[2]), e)];
};

// анимированная схема: комментарий → ManyChat → директ (моушн-вставка на весь экран)
const McFlow: React.FC<{ word: string; reply: string; btn: string; p: number }> = ({ word, reply, btn, p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const sp = (d: number) => spring({ frame: Math.round((t - d) * fps), fps, config: { damping: 13, stiffness: 160 } });
  const typed = word.slice(0, Math.max(0, Math.min(word.length, Math.floor((t - 0.55) * 9))));
  const bez = (u: number, a: number[], c: number[], b: number[]) => [
    (1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
  const u1 = interpolate(t, [1.3, 2.0], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const u2 = interpolate(t, [2.7, 3.3], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const d1 = bez(u1, [540, 600], [880, 700], [540, 800]);
  const d2 = bez(u2, [540, 900], [200, 1000], [540, 1110]);
  const dot = (xy: number[], on: boolean) => on ? <div style={{ position: "absolute", left: xy[0] - 22, top: xy[1] - 22, width: 44, height: 44, borderRadius: 22, background: "#ffd400", boxShadow: "0 0 40px 14px rgba(255,212,0,.55)" }} /> : null;
  const ring = (d: number) => { const k = interpolate(t, [d, d + 0.9], [0, 1], clamp); return <div style={{ position: "absolute", left: 540 - 110 - k * 90, top: 850 - 110 - k * 90, width: 220 + k * 180, height: 220 + k * 180, borderRadius: "50%", border: "6px solid #5b8cff", opacity: (1 - k) * (t > d ? 1 : 0) }} />; };
  const step = (n: string, y: number, d: number) => <div style={{ position: "absolute", left: 60, top: y, width: 70, height: 70, borderRadius: 35, background: "#fff", color: "#111", fontFamily: FONT, fontWeight: 900, fontSize: 40, display: "grid", placeItems: "center", transform: `scale(${sp(d)})` }}>{n}</div>;
  const a = sp(0.1), b = sp(1.9), c = sp(3.2), badge = sp(3.8);
  return (
    <AbsoluteFill style={{ opacity: p, background: "radial-gradient(120% 80% at 50% 45%, #1c2433 0%, #0b0e14 70%)" }}>
     <AbsoluteFill style={{ transform: "translateY(90px)" }}>
      <svg width={1080} height={1920} style={{ position: "absolute" }}>
        <path opacity={interpolate(t, [1.0, 1.3], [0, 1], clamp)} d="M540 600 Q880 700 540 800" stroke="#ffffff33" strokeWidth={6} fill="none" strokeDasharray="14 14" />
        <path opacity={interpolate(t, [2.4, 2.7], [0, 1], clamp)} d="M540 900 Q200 1000 540 1110" stroke="#ffffff33" strokeWidth={6} fill="none" strokeDasharray="14 14" />
      </svg>
      {step("1", 420, 0.1)}{step("2", 815, 1.9)}{step("3", 1200, 3.2)}
      {/* комментарий под рилсом */}
      <div style={{ position: "absolute", left: 170, right: 90, top: 330, height: 270, borderRadius: 34, background: "#fff", padding: "30px 36px", transform: `translateY(${(1 - a) * 60}px)`, opacity: a, boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: "#8a8f98" }}>Комментарии · рилс</div>
        <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 34 }}>
          <div style={{ width: 84, height: 84, borderRadius: 42, background: "linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)" }} />
          <div style={{ fontFamily: FONT, fontSize: 44, color: "#111" }}><b>anna_k</b>{"  "}<span style={{ fontWeight: 900 }}>{typed}</span><span style={{ opacity: t < 1.4 && Math.floor(t * 4) % 2 ? 1 : 0 }}>|</span></div>
        </div>
      </div>
      {dot(d1, t > 1.3 && t < 2.05)}
      {/* бот */}
      {ring(2.0)}{ring(2.35)}
      <div style={{ position: "absolute", left: 540 - 120, top: 850 - 120, width: 240, height: 240, borderRadius: "50%", background: "#2f6bff", display: "grid", placeItems: "center", transform: `scale(${b})`, boxShadow: "0 0 80px rgba(47,107,255,.6)" }}>
        <div style={{ fontSize: 110 }}>🤖</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1000, textAlign: "center", fontFamily: FONT, fontWeight: 900, fontSize: 48, color: "#fff", opacity: b }}>ManyChat</div>
      {dot(d2, t > 2.7 && t < 3.35)}
      {/* директ */}
      <div style={{ position: "absolute", left: 170, right: 90, top: 1110, borderRadius: 34, background: "#fff", padding: "26px 32px", transform: `scale(${0.85 + c * 0.15})`, opacity: c, boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 32, color: "#8a8f98", marginBottom: 18 }}>Директ</div>
        <div style={{ background: "#3797f0", color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 40, borderRadius: 30, padding: "18px 26px", display: "inline-block" }}>{reply}</div>
        <div style={{ marginTop: 18, border: "3px solid #3797f0", color: "#3797f0", fontFamily: FONT, fontWeight: 800, fontSize: 36, borderRadius: 22, padding: "14px 0", textAlign: "center" }}>{btn}</div>
      </div>
      <div style={{ position: "absolute", right: 70, top: 1075, background: "#ffd400", color: "#111", fontFamily: FONT, fontWeight: 900, fontSize: 38, borderRadius: 40, padding: "10px 26px", transform: `scale(${badge}) rotate(-6deg)` }}>за 1 секунду</div>
     </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Insert: React.FC<{ ins: Ins; p: number }> = ({ ins, p }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lt = f / fps;
  if (ins.kind === "phone") {
    const rate = ins.rate ?? 1;
    const vt = ins.trim + lt * rate;
    const [fy, sc] = keyf(ins.full, vt);
    return (
      <FullLayer p={p} fy={fy} sc={sc} h={2340}>
        <OffthreadVideo src={staticFile(`ai/${ins.src}`)} muted trimBefore={Math.round(ins.trim * FPS)} playbackRate={rate} style={{ width: 1080, height: 2340 }} />
        <Marks marks={ins.marks} t={vt} />
      </FullLayer>
    );
  }
  if (ins.kind === "web") {
    const [fy, sc] = keyf(ins.pan, lt);
    return (
      <FullLayer p={p} fy={fy} sc={sc} h={ins.h} bg="#f5f3ee">
        <Img src={staticFile(ins.img)} style={{ width: 1080, height: ins.h }} />
        <Marks marks={ins.marks} t={lt} />
      </FullLayer>
    );
  }
  if (ins.kind === "big") {
    const s = spring({ frame: f - 4, fps, config: { damping: 10 } });
    return (
      <Card p={p}>
        <AbsoluteFill style={{ background: "#111", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 8 }}>
          <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 44, color: "rgba(255,255,255,.85)" }}>{ins.top}</div>
          <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: ins.big.length > 6 ? 96 : 130, color: "#111", background: "#ffd400", padding: "0 40px", borderRadius: 30, transform: `scale(${s})` }}>{ins.big}</div>
          {ins.bottom && <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 40, color: "rgba(255,255,255,.85)" }}>{ins.bottom}</div>}
        </AbsoluteFill>
      </Card>
    );
  }
  if (ins.kind === "compare") {
    const row = (txt: string, ok: boolean, k: number) => {
      const s = spring({ frame: f - 3 - k * 6, fps, config: { damping: 11 } });
      return (
        <div key={txt} style={{ display: "flex", alignItems: "center", gap: 18, transform: `scale(${s})`, opacity: s > 0.02 ? 1 : 0 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: ok ? "#22c55e" : "#ef4444", color: "#fff", fontSize: 44, fontWeight: 900, display: "grid", placeItems: "center", fontFamily: "DejaVu Sans" }}>{ok ? "✓" : "✕"}</div>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 50, color: "#111" }}>{txt}</div>
        </div>
      );
    };
    return (
      <Card p={p}>
        <AbsoluteFill style={{ background: "#f4f1ea", flexDirection: "row", justifyContent: "space-around", alignItems: "center", padding: 30 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>{ins.yes.map((x, k) => row(x, true, k))}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>{ins.no.map((x, k) => row(x, false, k + ins.yes.length))}</div>
        </AbsoluteFill>
      </Card>
    );
  }
  if (ins.kind === "mcflow") return <McFlow word={ins.word} reply={ins.reply} btn={ins.btn} p={p} />;
  if (ins.kind === "flow") {
    const a = spring({ frame: f - 2, fps, config: { damping: 12 } });
    const b = spring({ frame: f - 10, fps, config: { damping: 12 } });
    const c = spring({ frame: f - 18, fps, config: { damping: 12 } });
    const box = (txt: string, bg: string, s: number, w = 260) => (
      <div style={{ width: w, padding: "16px 10px", borderRadius: 22, background: bg, color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 34, textAlign: "center", transform: `scale(${s})`, boxShadow: "0 10px 24px rgba(0,0,0,.18)" }}>{txt}</div>
    );
    return (
      <Card p={p}>
        <AbsoluteFill style={{ background: "#f4f1ea", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 18 }}>
          {box("💬 Сообщение", "#3b82f6", a, 230)}
          <div style={{ fontSize: 50, color: "#111", fontFamily: "DejaVu Sans", opacity: b }}>→</div>
          {box("🤖 Бот", CL, b, 170)}
          <div style={{ fontSize: 50, color: "#111", fontFamily: "DejaVu Sans", opacity: c }}>→</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {box("✓ Типовое: ответил", "#22c55e", c, 250)}
            {box("👤 Сложное: тебе", "#111", c, 250)}
          </div>
        </AbsoluteFill>
      </Card>
    );
  }
  if (ins.kind === "approve") {
    const a = spring({ frame: f - 2, fps, config: { damping: 12 } });
    const b = spring({ frame: f - 10, fps, config: { damping: 12 } });
    const col = (ok: boolean, title: string, lines: string[], s: number) => (
      <div style={{ flex: 1, background: ok ? "#e8f8ee" : "#fdecec", borderRadius: 24, padding: 22, transform: `scale(${s})` }}>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 40, color: ok ? "#15803d" : "#b91c1c", marginBottom: 10 }}>{title}</div>
        {lines.map((x) => <div key={x} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 30, color: "#111", lineHeight: 1.35 }}>{x}</div>)}
      </div>
    );
    return (
      <Card p={p}>
        <AbsoluteFill style={{ background: "#f4f1ea", flexDirection: "row", gap: 18, padding: 24 }}>
          {col(true, "✓ Одобряют", ["живой продукт", "есть пользователи", "сайт и приложения", "несколько месяцев"], a)}
          {col(false, "✕ Отказ", ["сайт за вечер", "нет истории", "типовая идея"], b)}
        </AbsoluteFill>
      </Card>
    );
  }
  if (ins.kind === "chat") {
    const A: Record<string, { name: string; bar: string; bg: string; me: string; them: string; ink: string }> = {
      whatsapp: { name: "WhatsApp", bar: "#075e54", bg: "#ece5dd", me: "#dcf8c6", them: "#ffffff", ink: "#111" },
      instagram: { name: "Instagram · Директ", bar: "linear-gradient(90deg,#833ab4,#fd1d1d,#fcb045)", bg: "#ffffff", me: "#3797f0", them: "#efefef", ink: "#111" },
      avito: { name: "Авито · Сообщения", bar: "#00aaff", bg: "#f5f5f5", me: "#d6f0ff", them: "#ffffff", ink: "#111" },
      wb: { name: "Wildberries · Чат с покупателем", bar: "linear-gradient(90deg,#cb11ab,#481173)", bg: "#f6f0fa", me: "#ffffff", them: "#ffffff", ink: "#111" },
      telegram: { name: "Telegram Business", bar: "#2aabee", bg: "#cfe3c3", me: "#effdde", them: "#ffffff", ink: "#111" },
    };
    const c = A[ins.app];
    const qIn = spring({ frame: f - 6, fps, config: { damping: 14 } });
    const typingOn = f > 24 && f < 48;
    const aStart = 48;
    const chars = Math.max(0, Math.min(ins.a.length, Math.round((f - aStart) * 2.2)));
    const aIn = spring({ frame: f - aStart, fps, config: { damping: 14 } });
    const bubble = (txt: string, mine: boolean, sc: number, extra?: React.ReactNode) => (
      <div style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: 820, background: mine ? c.me : c.them, color: ins.app === "instagram" && mine ? "#fff" : c.ink, borderRadius: 34, padding: "26px 34px", fontFamily: FONT, fontWeight: 600, fontSize: 46, lineHeight: 1.25, boxShadow: "0 6px 18px rgba(0,0,0,.12)", transform: `scale(${sc})`, transformOrigin: mine ? "right bottom" : "left bottom", opacity: sc > 0.02 ? 1 : 0 }}>{extra}{txt}</div>
    );
    return (
      <AbsoluteFill style={{ background: c.bg, opacity: p }}>
        <div style={{ height: 230, background: c.bar, display: "flex", alignItems: "flex-end", padding: "0 44px 34px", gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, background: "rgba(255,255,255,.25)", display: "grid", placeItems: "center", fontSize: 54 }}>{"👤"}</div>
          <div style={{ fontFamily: FONT, fontWeight: 800, fontSize: 50, color: "#fff" }}>{c.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 34, padding: "70px 48px" }}>
          {ins.pre && <div style={{ alignSelf: "center", fontFamily: FONT, fontSize: 34, color: "#777", opacity: qIn }}>{ins.pre}</div>}
          {bubble(ins.q, false, qIn, ins.stars ? <div style={{ color: "#f5a623", fontSize: 50, marginBottom: 8, fontFamily: "DejaVu Sans" }}>{"★".repeat(ins.stars)}</div> : null)}
          {typingOn && <div style={{ alignSelf: "flex-end", fontFamily: FONT, fontSize: 38, color: "#666", background: c.me, borderRadius: 30, padding: "18px 30px" }}>печатает{".".repeat(1 + (Math.floor(f / 6) % 3))}</div>}
          {f >= aStart && bubble(ins.a.slice(0, chars), true, aIn)}
          {f >= aStart + 10 && <div style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: 12, fontFamily: FONT, fontWeight: 700, fontSize: 32, color: "#555", opacity: aIn }}>{ins.badge ? <>⚡ {ins.badge}</> : <><Logo who="cl" size={44} /> ответ нейросети</>}</div>}
        </div>
      </AbsoluteFill>
    );
  }
  // cta
  const s = spring({ frame: f - 3, fps, config: { damping: 10 } });
  const pulse = 1 + Math.sin(f / 5) * 0.03;
  return (
    <Card p={p}>
      <AbsoluteFill style={{ background: "#111", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 14 }}>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 52, color: "#fff" }}>{ins.l1}</div>
        <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: 48, color: "#111", background: "#ffd400", padding: "6px 30px", borderRadius: 26, transform: `scale(${s * pulse})` }} dangerouslySetInnerHTML={{ __html: ins.chip }} />
        <div style={{ fontFamily: FONT, fontWeight: 700, fontSize: 34, color: "rgba(255,255,255,.8)" }}>{ins.l2}</div>
        <div style={{ fontSize: 56, transform: `translateY(${Math.sin(f / 4) * 10}px)` }}>👇</div>
      </AbsoluteFill>
    </Card>
  );
};

const Captions: React.FC<{ words: W[]; t: number; y: number }> = ({ words, t, y }) => {
  const { fps } = useVideoConfig();
  let i = -1;
  for (let k = 0; k < words.length; k++) if (words[k][1] <= t + 0.03) i = k;
  if (i < 0) return null;
  const [raw, s] = words[i];
  const w = raw.replace(/[.,!?:;»]+$/, "").replace(/^[«"(]+/, "");
  const nextS = i + 1 < words.length ? words[i + 1][1] : s + 0.8;
  if (t > Math.max(nextS, s + 0.4) + 0.6) return null;
  const pop = spring({ frame: Math.round((t - s) * fps), fps, config: { damping: 12, stiffness: 220 } });
  const color = /Claude/.test(w) ? "#ffab85" : /ChatGPT|GPT/.test(w) ? "#3fe0b0" : /\d|×/.test(w) ? "#ffd400" : "#fff";
  const icon = /ChatGPT/.test(w) ? "gpt" : /Claude/.test(w) ? "cl" : null;
  const size = w.length > 12 ? 78 : 92;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 16 }}>
      {icon && <div style={{ transform: `scale(${pop})` }}><Logo who={icon as "gpt" | "cl"} size={100} /></div>}
      <div style={{ fontFamily: FONT, fontWeight: 900, fontSize: size, color, textTransform: "uppercase", letterSpacing: -1, WebkitTextStroke: "14px #000", paintOrder: "stroke fill", textShadow: "0 8px 20px rgba(0,0,0,.5)", transform: `scale(${0.7 + pop * 0.3})`, whiteSpace: "nowrap" }}>{w}</div>
    </div>
  );
};

// субтитры фразами в белой плашке (стиль референса)
const PhraseCaptions: React.FC<{ words: W[]; t: number; y: number }> = ({ words, t, y }) => {
  const chunks: { s: number; e: number; text: string }[] = [];
  let cur: W[] = [];
  const flush = () => { if (cur.length) chunks.push({ s: cur[0][1], e: cur[cur.length - 1][2], text: cur.map((w) => w[0]).join(" ").replace(/[«»"]/g, "").replace(/[.,:;]+$/, "") }); cur = []; };
  for (const w of words) { cur.push(w); const n = cur.map((x) => x[0]).join(" ").length; if (/[.!?]$/.test(w[0]) || (/[:;,]$/.test(w[0]) && n > 12) || n > 38) flush(); }
  flush();
  let i = -1;
  for (let k = 0; k < chunks.length; k++) if (chunks[k].s <= t + 0.05) i = k;
  if (i < 0) return null;
  const c = chunks[i];
  const next = i + 1 < chunks.length ? chunks[i + 1].s : c.e + 0.8;
  if (t > Math.max(next, c.e) + 0.4) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center" }}>
      <div style={{ maxWidth: 900, background: "#fff", color: "#111", fontFamily: FONT, fontWeight: 700, fontSize: 46, lineHeight: 1.18, padding: "14px 26px", borderRadius: 14, textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,.25)" }}>{c.text}</div>
    </div>
  );
};

const wordsOf = (key: string) => ((WORDS as unknown as Record<string, W[]>)[key] ?? []);
const lastEnd = (w: W[]) => (w.length ? w[w.length - 1][2] : 5);
export const durOf = (topic: string, k: string) => {
  const d = (WORDS as unknown as Record<string, number>)[`${topic}.${k}.dur`];
  return typeof d === "number" ? d : lastEnd(wordsOf(`${topic}.${k}`)) + 0.4;
};
export const rFrames = (v: RVersion) => Math.round((durOf(v.topic, v.hook) + durOf(v.topic, "body")) * FPS);

export const RomanReel: React.FC<RVersion> = ({ topic, hook, cap }) => {
  const T = TOPICS[topic];
  const f = useCurrentFrame();
  const t = f / FPS;
  const hookDur = durOf(topic, hook);
  const bodyDur = durOf(topic, "body");
  const hw = wordsOf(`${topic}.${hook}`);
  const bw = wordsOf(`${topic}.body`);
  const inBody = t >= hookDur;
  const lt = inBody ? t - hookDur : t;
  const list: { x: Ins; a: number; b: number }[] = [];
  for (const x of T.hookIns?.[hook] ?? []) { const a = resolve(x.from, hw, hookDur), b = resolve(x.to, hw, hookDur); if (a >= 0 && b > a) list.push({ x, a, b }); }
  for (const x of T.body) { const a = resolve(x.from, bw, bodyDur), b = resolve(x.to, bw, bodyDur); if (a >= 0 && b > a) list.push({ x, a: a + hookDur, b: b + hookDur }); }
  list.sort((m, n) => m.a - n.a);
  // короткие промежутки между вставками не показываем — иначе лицо мелькает
  for (let i = 0; i + 1 < list.length; i++) if (list[i + 1].a - list[i].b < 2.5) list[i].b = list[i + 1].a + 0.25;
  let fullP = 0;
  let fullOn = false;
  for (const { x, a, b } of list) if (x.kind === "phone" || x.kind === "web" || x.kind === "chat" || x.kind === "mcflow") {
    fullP = Math.max(fullP, interpolate(t, [a - 0.1, a + 0.2, b - 0.2, b + 0.1], [0, 1, 1, 0], clamp));
    if (t >= a && t < b) fullOn = true;
  }
  // лёгкий наезд на лицо на каждой новой фразе (по точкам в расшифровке)
  const cuts: number[] = [];
  for (const [w, s] of [...hw.map((x) => x), ...bw.map((x) => [x[0], x[1] + hookDur, x[2]] as W)]) if (/[.!?]$/.test(w)) cuts.push(s + 0.3);
  // плавный наезд (0.6 с) вместо скачка; в полноэкранном хуке наездов нет
  let zoomOn = false, last = -9;
  for (const c of cuts) { if (c > t) break; if (c - last >= 2) { zoomOn = !zoomOn; last = c; } }
  const zp = interpolate(t, [last, last + 0.6], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const zoom = 1 + 0.06 * (zoomOn ? zp : 1 - zp);
  const hookFrames = Math.round(hookDur * FPS);
  // хук крупным планом — лицо на весь экран
  const full = !!T.hookFull && !inBody;
  // в местах скачков HeyGen — резкий наезд/отъезд, чтобы скачок читался как монтажная склейка
  const jumpZoom = (T.jumps?.[hook] ?? []).filter((j) => j <= t).length % 2 ? 1.12 : 1;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(180deg,#141922 0%,#1d2531 100%)" }}>
      <div style={{ position: "absolute", left: 0, top: full ? 0 : 860, width: 1080, height: full ? 1920 : 1060, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: full ? 0 : -250, width: 1080, height: 1920, transform: `scale(${full ? jumpZoom : zoom})`, transformOrigin: "50% 30%" }}>
          <Sequence durationInFrames={hookFrames}>
            <OffthreadVideo src={staticFile(`${T.dir}/${hook}.mp4`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
          <Sequence from={hookFrames}>
            <OffthreadVideo src={staticFile(`${T.dir}/osnova.mp4`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </Sequence>
        </div>
      </div>
      {!full && <div style={{ position: "absolute", left: 0, right: 0, top: 850, height: 30, background: "linear-gradient(180deg,#1d2531,#1d253100)" }} />}
      {list.map(({ x, a, b }, i) => (
        <Sequence key={i} from={Math.round(a * FPS)} durationInFrames={Math.max(1, Math.round((b - a) * FPS))}>
          <Insert ins={x} p={interpolate(t, [a, a + 0.25, b - 0.25, b], [0, 1, 1, 0], clamp)} />
        </Sequence>
      ))}
      <div style={{ position: "absolute", left: 70, right: 150, top: 230, background: "#fff", borderRadius: 34, padding: "22px 30px", textAlign: "center", fontFamily: FONT, fontWeight: 800, fontSize: 52, lineHeight: 1.12, color: "#111", boxShadow: "0 14px 40px rgba(0,0,0,.18)", opacity: 1 - fullP }}>
        {T.plates[hook]}
      </div>
      {cap === "phrase"
        ? <PhraseCaptions words={inBody ? bw : hw} t={lt} y={fullOn || full ? 1500 : 880} />
        : <Captions words={inBody ? bw : hw} t={lt} y={fullOn || full ? 1480 : 868} />}
    </AbsoluteFill>
  );
};

export const R_VERSIONS: Record<string, RVersion> = Object.fromEntries(
  Object.keys(TOPICS).flatMap((tp) => (["h1", "h2", "h3"] as const).flatMap((h) => [
    [`${tp}-${h}`, { topic: tp, hook: h }],
    [`${tp}-${h}-ph`, { topic: tp, hook: h, cap: "phrase" }],
  ]))
);

// превью моушн-вставки отдельно
export const McFlowDemo: React.FC = () => (
  <AbsoluteFill style={{ background: "#0b0e14" }}>
    <McFlow word="ПРАЙС" reply="Привет! Держи прайс 👇" btn="Открыть прайс" p={1} />
  </AbsoluteFill>
);
