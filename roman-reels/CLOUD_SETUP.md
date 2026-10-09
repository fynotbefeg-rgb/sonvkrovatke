# Roman Reels — облачный запуск через GitHub Actions (этап 1: ручная проверка)

Ветка: `automation/roman-reels-v1`. Дата: 9 октября 2026.

## Итог

Добавлен workflow `.github/workflows/roman-reels-check.yml`. Он запускается **только вручную** (`workflow_dispatch`): расписания, push- и PR-триггеров нет.

Что делает workflow:
- ставит зависимости проекта `roman-reels/pv` (`npm ci`);
- проверяет скрипты;
- собирает бандл Remotion и выводит список композиций;
- проверяет, что для выбранных тем есть `R-<тема>-h1`, `-h2`, `-h3`.

Чего workflow не делает: не рендерит видео, не загружает на Google Drive, не использует секреты. Права — только чтение репозитория.

Монтаж (`roman-reels/pv/src/**`), скрипты рендера и загрузки, ветки `main` и `claude/reels-videophone-footage-xdoy8a` не менялись.

**Workflow ни разу не запускался в GitHub.** Я его не запускал, а без файла в ветке `main` его нельзя запустить из интерфейса (см. «Как запустить»). Все шаги проверены локально, см. «Проверки».

## Файлы

| Файл | Что это |
|---|---|
| `.github/workflows/roman-reels-check.yml` | Новый workflow (корень репозитория — GitHub читает workflow только из `.github/workflows/`) |
| `roman-reels/CLOUD_SETUP.md` | Этот отчёт |

## Что делает workflow

Раннер `ubuntu-latest`, тайм-аут 20 минут. Параллельные запуски для одной ветки отменяют друг друга.

| # | Шаг | Команда (в `roman-reels/pv`) |
|---|---|---|
| 1 | Checkout | `actions/checkout@v4` (последний коммит, без LFS) |
| 2 | Node.js 22 + кэш npm | `actions/setup-node@v4`, кэш по `roman-reels/pv/package-lock.json` |
| 3 | Зависимости | `npm ci` |
| 4 | Синтаксис скриптов | `node --check scripts/*.mjs` |
| 5 | Проверка аргументов | `render-topic.mjs` с несуществующей темой → код 2; `render-quality.mjs` с неверным именем → код 2; `upload-topic.mjs` без `ROMAN_DRIVE_REMOTE` → код 2. Ничего не рендерится и не загружается |
| 6 | Браузер для Remotion | `npx remotion browser ensure` (скачивает Chrome Headless Shell) |
| 7 | Список композиций | `npx remotion compositions src/index.ts \| tee compositions.txt` — только бандл и расчёт метаданных, без рендера кадров |
| 8 | Обязательные композиции | Для каждой темы из поля `topics` ищет `R-<тема>-h1..h3` в списке. Имя темы проверяется по `[a-z0-9_-]`, иначе ошибка. Значение поля передаётся через переменную окружения, а не подставляется в скрипт |
| 9 | Артефакт | `compositions.txt` сохраняется на 7 дней (`actions/upload-artifact@v4`) |

Поле запуска `topics` по умолчанию — `manychat startups`.

## Проверки (локально, Linux, Node v22.22.2)

| Проверка | Результат |
|---|---|
| YAML разбирается (PyYAML 6.0.1); единственный триггер — `workflow_dispatch`; 9 шагов | ✅ |
| `package-lock.json` согласован с `package.json`: lockfileVersion 3, 0 расхождений; remotion, @remotion/cli, @remotion/fonts, @remotion/media — 4.0.527 | ✅ (`npm ci` не упадёт из-за рассинхрона) |
| Шаг 4: `node --check` для `render-quality.mjs`, `render-topic.mjs`, `upload-topic.mjs` | ✅ |
| Шаг 5: три негативные проверки, коды 2/2/2 | ✅ «Проверки аргументов пройдены» |
| Шаг 7: `npx remotion compositions src/index.ts` (на уже установленных зависимостях той же версии 4.0.527, ~14 с) | ✅ 32 композиции, в том числе `R-manychat-h1..h3` (≈80–82 с, 25 fps, 1080×1920) и `R-startups-h1..h3` (≈85–86 с) |
| Шаг 8 с `manychat startups` | ✅ 6 × ok, код 0 |
| Шаг 8 с несуществующей темой | ✅ «НЕТ композиции: R-nosuch-h1..h3», код 1 |
| Шаг 8 с именем `x;rm` | ✅ «Недопустимое имя темы», код 1 |
| `npx remotion help` содержит команды `browser` и `compositions` | ✅ |

Чем локальная проверка отличается от облака:
- `npm ci` локально не запускался: использовались уже установленные пакеты той же версии;
- `npx remotion browser ensure` не запускался: использовался локальный Chrome Headless Shell;
- `actionlint` не установлен, поэтому выражения GitHub (`${{ }}`) проверены вручную;
- в самом GitHub Actions workflow не запускался.

Список композиций не требует видеофайлов из `public/rr/*` (их нет в git), поэтому проверка проходит без исходников HeyGen. Шрифты (`public/fonts/*.woff2`) лежат в git.

## Как запустить

**Важно.** GitHub показывает кнопку «Run workflow» и разрешает `workflow_dispatch` только для workflow, файл которого есть в ветке по умолчанию (`main`). Сейчас файл только в `automation/roman-reels-v1`, поэтому в разделе Actions workflow не появится. Ветку `main` я не менял.

Чтобы включить запуск, один раз:
1. Добавить в `main` этот же файл `.github/workflows/roman-reels-check.yml` (через PR или копированием одного файла).
2. Actions → «Roman Reels — проверка (ручной запуск)» → **Run workflow**.
3. В «Use workflow from» выбрать `automation/roman-reels-v1`. Тогда будет проверен код этой ветки и её версия workflow.
4. Поле `topics` — оставить `manychat startups` или указать свои темы через пробел.
5. Результат: зелёная галочка и артефакт `roman-reels-compositions` со списком композиций.

Из командной строки (после шага 1):
```bash
gh workflow run roman-reels-check.yml --ref automation/roman-reels-v1 -f topics="manychat startups"
```

## Стоимость и безопасность

- Репозиторий **публичный**. Стандартные раннеры GitHub (`ubuntu-latest`) для публичных репозиториев бесплатны. Платные раннеры (larger runners) не используются.
- Секретов нет, `permissions: contents: read`. Workflow ничего не пушит и ничего не загружает наружу, кроме артефакта со списком композиций внутри GitHub.
- Ожидаемое время запуска: 2–5 минут, в основном `npm ci` и скачивание браузера. Это оценка, не замер.

## Следующие этапы (не сделано)

1. Тестовый рендер одной композиции в облаке. Нужны исходники темы на раннере: скачать `public/rr/<тема>/*.mp4` и `public/ai/mc_*.mp4` с Google Drive через rclone с секретом в GitHub Secrets. Рендер ~80-секундного Reel займёт порядка 10–20 минут на стандартном раннере (оценка).
2. Выгрузка результатов на Drive тем же rclone-секретом (`npm run upload:topic`).
3. Нормализация громкости после рендера (см. замечание в `AUTOMATION_REPORT.md`).
4. Только после ручных тестов — запуск по событию (например, по новой папке с исходниками).
