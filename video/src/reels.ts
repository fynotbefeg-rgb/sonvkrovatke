import type { SceneSpec } from "./Reel";

// Рилсы по плану content/30-days.md. Ключ — id композиции и имя файла в renders/
// В строках стоят неразрывные пробелы (U+00A0), чтобы предлоги не висели в конце строки

const F = {
  holding: "stock-mom-holding-asleep.mp4",
  byCrib: "stock-asleep-by-crib.mp4",
  rocking: "stock-mom-rocking-crib.mp4",
  putting: "stock-putting-in-crib.mp4",
  bedroom: "ai-bedroom-night.mp4",
  handOnChest: "stock-hand-on-chest.mp4",
  asleepTop: "stock-asleep-top-view.mp4",
  asleepFace: "stock-asleep-face.mp4",
  lampBook: "stock-lamp-book.mp4",
  holdingHand: "stock-holding-baby-hand.mp4",
  hands: "stock-hands-closeup.mp4",
  childAsleep: "stock-child-asleep-bed.mp4",
  phoneDark: "stock-phone-dark.mp4",
  eyesOpen: "stock-baby-eyes-open.mp4",
  momReading: "stock-mom-reading.mp4",
  fairyLights: "stock-reading-fairy-lights.mp4",
  momPhone: "stock-mom-phone-bed.mp4",
};

// Правила сценария: хук с обещанием виден с первого кадра, сцена 1,5–3 с,
// видеофон в каждой сцене, решение появляется к 4-й секунде, ролик 9–12 с
const memoCta: SceneSpec = {
  kind: "cta",
  duration: 90,
  kicker: "Бесплатная памятка",
  title: "7 движений, чтобы переложить малыша и не разбудить",
  button: "Ссылка в профиле",
  note: "Попробуйте сегодня вечером, на любом сне",
};

export const reels: Record<string, SceneSpec[]> = {
  Day01: [
    {
      kind: "hook",
      duration: 70,
      footage: F.holding,
      kicker: "02:40 · снова не спите",
      lines: ["Он засыпает", "только на руках?"],
      sub: "Проверьте одну вещь сегодня вечером ↓",
      size: 118,
    },
    {
      kind: "timeline",
      duration: 75,
      footage: F.rocking,
      rows: [
        ["20:10", "уснул на руках"],
        ["20:35", "переложила — проснулся"],
        ["21:20", "снова на руках"],
      ],
    },
    { kind: "statement", duration: 75, footage: F.bedroom, title: "Он не перерастёт сам.", body: "Он просто ни разу не пробовал заснуть", highlight: "иначе." },
    { ...memoCta, footage: F.putting },
  ],

  Day02: [
    { kind: "hook", duration: 70, footage: F.handOnChest, lines: ["Почему он", "просыпается,", "как только вы", "кладёте его", "в кроватку?"], size: 104 },
    { kind: "number", duration: 75, value: "15", label: "минут после засыпания сон поверхностный", sub: "Его будит даже прохладная простыня" },
    { kind: "statement", duration: 70, footage: F.asleepFace, title: "Большинство кладут на 5-й минуте.", body: "Подождите", highlight: "15." },
    { ...memoCta, footage: F.lampBook, title: "Тест обмякшей руки и 7 движений" },
  ],

  Day03: [
    { kind: "notes", duration: 80, text: "«Потерпи, он перерастёт»", answer: "Самый частый совет. И самый бесполезный." },
    { kind: "statement", duration: 70, footage: F.asleepTop, title: "Он засыпает на руках не потому, что маленький." },
    { kind: "statement", duration: 70, footage: F.holdingHand, title: "А потому, что ни разу не пробовал", highlight: "иначе." },
    {
      kind: "cta",
      duration: 90,
      footage: F.hands,
      kicker: "Лестница из 7 ступеней",
      title: "Привычку меняют по одной ступеньке",
      button: "Закреп в профиле",
    },
  ],

  Day04: [
    { kind: "hook", duration: 60, footage: F.momPhone, lines: ["Час на руках", "каждый вечер?"], sub: "Вот как выглядит вечер по методу ↓" },
    {
      kind: "timeline",
      duration: 90,
      footage: F.fairyLights,
      kicker: "Вечер по методу",
      rows: [
        ["20:00", "ритуал, 5 действий"],
        ["20:15", "спит в своей кроватке"],
        ["20:16", "вы свободны"],
      ],
    },
    { kind: "number", duration: 60, value: "15", label: "минут вместо часа на руках", sub: "Мягко, за 14 дней" },
    { ...memoCta, footage: F.asleepTop },
  ],

  Day05: [
    { kind: "hook", duration: 60, footage: F.holdingHand, kicker: "Чит-код", lines: ["Тест", "обмякшей руки"], sub: "3 секунды решают, проснётся ли он" },
    {
      kind: "steps",
      duration: 135,
      footage: F.hands,
      items: [
        "Поднимите его кисть на 2–3 см и отпустите",
        "Упала как плеть — можно класть",
        "Напряглась, пальцы сжались — ждите ещё 5 минут",
      ],
    },
    { ...memoCta, footage: F.asleepFace, kicker: "Дальше — 7 движений", title: "Они в бесплатной памятке" },
  ],

  Day06: [
    { kind: "hook", duration: 55, footage: F.phoneDark, kicker: "POV", lines: ["40 минут", "укачивания"], sub: "и вот он наконец уснул…" },
    { kind: "statement", duration: 45, footage: F.putting, title: "Вы наклоняетесь к кроватке…" },
    { kind: "statement", duration: 45, footage: F.eyesOpen, title: "Он открывает глаза.", size: 110 },
    { kind: "notes", duration: 100, text: "Дело в 3 мелочах, о которых никто не говорит", answer: "Разбор — в памятке, ссылка в профиле" },
  ],

  Day07: [
    { kind: "hook", duration: 60, footage: F.momReading, lines: ["Почему резко", "отучать от рук", "не работает"], size: 112 },
    { kind: "statement", duration: 70, footage: F.childAsleep, title: "Убираете всё сразу — он теряет всё сразу.", body: "И", highlight: "протестует." },
    {
      kind: "ladder",
      duration: 135,
      footage: F.bedroom,
      kicker: "Мягкий путь — 7 ступеней",
      steps: [
        "укачивание на руках",
        "на руках, без укачивания",
        "сонным в кроватку",
        "ладонь на груди",
        "касание по требованию",
        "сидите рядом",
        "у двери",
        "засыпает сам",
      ],
    },
    {
      kind: "cta",
      duration: 90,
      footage: F.handOnChest,
      kicker: "Руководство «Сон без укачивания»",
      title: "7 шагов, лестница ступеней, 14 дней",
      button: "Подробности — в профиле",
      note: "Начните с бесплатной памятки",
    },
  ],
};
