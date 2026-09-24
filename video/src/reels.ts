import type { SceneSpec } from "./Reel";

// Рилсы по плану content/30-days.md. Ключ — id композиции и имя файла в renders/
// В строках стоят неразрывные пробелы (U+00A0), чтобы предлоги не висели в конце строки

const F = {
  holding: "stock-mom-holding-asleep.mp4",
  byCrib: "stock-asleep-by-crib.mp4",
  rocking: "stock-mom-rocking-crib.mp4",
  putting: "stock-putting-in-crib.mp4",
  bedroom: "ai-bedroom-night.mp4",
};

const memoCta: SceneSpec = {
  kind: "cta",
  duration: 120,
  kicker: "Бесплатная памятка",
  title: "7 движений, чтобы переложить малыша и не разбудить",
  button: "Ссылка в профиле",
  note: "Попробуйте сегодня вечером, на любом сне",
};

export const reels: Record<string, SceneSpec[]> = {
  Day01: [
    { kind: "hook", duration: 75, footage: F.holding, kicker: "02:40 · снова не спите", lines: ["Он", "засыпает", "только", "на руках?"] },
    {
      kind: "timeline",
      duration: 150,
      footage: F.rocking,
      rows: [
        ["20:10", "уснул на руках"],
        ["20:35", "переложила в кроватку"],
        ["20:37", "плачет"],
        ["21:20", "снова на руках, поясница"],
        ["02:40", "вы смотрите это одной рукой"],
      ],
    },
    { kind: "statement", duration: 105, footage: F.bedroom, title: "Он не перерастёт сам.", body: "Он просто ни разу не пробовал заснуть", highlight: "иначе." },
    { ...memoCta, footage: F.putting },
  ],

  Day02: [
    { kind: "hook", duration: 90, footage: F.byCrib, lines: ["Почему он", "просыпается,", "как только вы", "кладёте его", "в кроватку?"], size: 104 },
    { kind: "statement", duration: 90, footage: F.bedroom, kicker: "Всё дело во времени", title: "Первые 15 минут после засыпания сон поверхностный" },
    { kind: "statement", duration: 90, footage: F.holding, title: "Большинство кладут на 5-й минуте.", body: "Подождите", highlight: "15." },
    { ...memoCta, footage: F.putting, title: "Тест обмякшей руки и 7 движений" },
  ],

  Day03: [
    { kind: "hook", duration: 75, kicker: "Самый частый совет", lines: ["«Перерастёт", "сам»"] },
    { kind: "statement", duration: 90, title: "Он засыпает на руках не потому, что маленький." },
    { kind: "statement", duration: 90, title: "А потому, что ни разу не пробовал", highlight: "иначе." },
    { kind: "statement", duration: 90, title: "Привычку не перерастают.", body: "Её меняют —", highlight: "по одной ступеньке." },
    {
      kind: "cta",
      duration: 105,
      kicker: "Лестница из 7 ступеней",
      title: "Весь метод на одной картинке",
      button: "Закреп в профиле",
    },
  ],

  Day04: [
    {
      kind: "timeline",
      duration: 120,
      kicker: "Вечер сейчас",
      accentLast: false,
      rows: [
        ["20:10", "уснул на руках"],
        ["20:35", "переложила в кроватку"],
        ["20:37", "плачет"],
        ["21:20", "снова на руках"],
      ],
    },
    {
      kind: "timeline",
      duration: 120,
      footage: F.bedroom,
      kicker: "Вечер, к которому ведёт метод",
      rows: [
        ["20:00", "ритуал, 5 действий"],
        ["20:15", "спит в своей кроватке"],
        ["20:16", "вы свободны"],
      ],
    },
    { kind: "statement", duration: 90, title: "15 минут вместо часа.", body: "Мягко, за", highlight: "14 дней." },
    memoCta,
  ],

  Day05: [
    { kind: "hook", duration: 70, footage: F.holding, kicker: "Чит-код", lines: ["Тест", "обмякшей", "руки"] },
    {
      kind: "steps",
      duration: 150,
      footage: F.byCrib,
      items: [
        "Поднимите его кисть на 2–3 см и отпустите",
        "Упала как плеть — можно класть",
        "Напряглась, пальцы сжались — ждите ещё 5 минут",
      ],
    },
    { ...memoCta, footage: F.putting, kicker: "Дальше — 7 движений", title: "Они в бесплатной памятке" },
  ],

  Day06: [
    { kind: "hook", duration: 70, footage: F.rocking, kicker: "POV", lines: ["40 минут", "укачивания"] },
    { kind: "statement", duration: 60, footage: F.holding, title: "Он наконец уснул." },
    { kind: "statement", duration: 60, footage: F.putting, title: "Вы наклоняетесь к кроватке…" },
    { kind: "statement", duration: 60, footage: F.bedroom, title: "Он открывает глаза.", size: 110 },
    {
      kind: "cta",
      duration: 120,
      kicker: "Знакомо?",
      title: "Дело в 3 мелочах, о которых никто не говорит",
      button: "Памятка — в профиле",
    },
  ],

  Day07: [
    { kind: "hook", duration: 90, lines: ["Почему резко", "отучать", "от рук", "не работает"], size: 112 },
    { kind: "statement", duration: 90, footage: F.holding, title: "Убираете всё сразу — он теряет всё сразу.", body: "И", highlight: "протестует." },
    { kind: "statement", duration: 75, title: "Мягкий путь —", body: "снимать помощь", highlight: "по одному слою." },
    {
      kind: "ladder",
      duration: 150,
      kicker: "7 ступеней",
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
      duration: 120,
      footage: F.putting,
      kicker: "Руководство «Сон без укачивания»",
      title: "7 шагов, лестница ступеней, 14 дней",
      button: "1 199 ₽ — в профиле",
      note: "Начните с бесплатной памятки",
    },
  ],
};
