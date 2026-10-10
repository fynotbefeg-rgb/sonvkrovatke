# Рилсы Романа (AI для бизнеса) — рабочая папка

## Автоматизация без HeyGen API

Цель: **утверждение Романом сценария и хуков → кнопка Telegram-бота → HeyGen через интерфейс удалённого ноутбука → Drive → расшифровка → Remotion → готовый ролик**. [Актуальная архитектура и статус](docs/TELEGRAM_LAPTOP_PIPELINE.md). Бот и управление ноутбуком пока не подключены.

[Роли инструментов](docs/PROJECT_ROLES.md) и [первое конкретное задание Claude Code](docs/CLAUDE_CODE_TASK_01.md).
[Передача задания без копирования через GitHub Actions](docs/CLAUDE_CODE_AUTOMATION.md) подготовлена, но требует единовременной OAuth-настройки и активации.

Первый сценарий с тремя хуками для проверки: [REVIEW.md](research/roman-pilot-review/REVIEW.md). Подготовка точного пакета и текущие ограничения утверждения: [SCRIPT_REVIEW.md](docs/SCRIPT_REVIEW.md).

Текущий проверенный статус, формат приёма MP4 и ручной dry run: [MANUAL_HEYGEN_INTAKE.md](docs/MANUAL_HEYGEN_INTAKE.md).
Проверки: `node roman-reels/scripts/manual-intake.test.mjs` из корня репозитория. Приёмщик пока строит план, производство не запускает.

## Шаблон монтажа
- `pv/src/RomanReel.tsx` — шаблон v2: вставки привязаны к ФРАЗАМ расшифровки, контент на весь экран без кружка, плашка-хук, субтитры по слову.
  Темы описаны в `TOPICS` (otvety — «нейросеть отвечает клиентам: 3 уровня», startups — «Claude бесплатно на год»).
  Композиции: `R-<тема>-h1|h2|h3`.
- `pv/src/AiReel.tsx` — пилот темы 1 (старый шаблон).

## Завтрашний порядок (на каждую тему)
1. Положить ролики HeyGen в `pv/public/rr/<тема>/` как `h1.mp4 h2.mp4 h3.mp4 osnova.mp4`.
2. Новые записи экрана — в `pv/public/ai/` (перекодировать: `ffmpeg -i in.mp4 -an -vf "fps=30,scale=1080:-2,format=yuv420p" -c:v libx264 -crf 18 out.mp4`), поправить `src` в TOPICS.
3. `python scripts/prep_topic.py <тема>` — распознаёт слова (faster-whisper medium), выравнивает с утверждённым текстом (`scripts/texts.json`), пишет тайминги в `pv/src/romanWords.json`.
4. Проверить стоп-кадры, затем
   `npx remotion render R-<тема>-h1 out/x.mp4 --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell --concurrency=4`
   и пережать: `-b:v 4500k ... -af loudnorm=I=-14:TP=-1.5:LRA=9` (до 30 МБ).

## Вставки
- `pv/public/ai/` — записи экрана Claude: s2 (отзыв), s3 (доставка с заглушками), s4 (доставка 450 ₽).
- `pv/public/ai2/` — скриншоты claude.com/programs/startups и anthropic.com/supported-countries (снимались через Playwright с проверкой TLS в Node: `scripts/shot*.cjs`, запуск с `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`).

## Документы
`docs/` — гайды, сценарии на согласование, таблица эмоций для аватара.
