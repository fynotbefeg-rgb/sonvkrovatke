# Roman Reels — автоматическая выгрузка на Google Drive

Ветка: `automation/roman-reels-v1`. Проект: `roman-reels/pv/`.
Дата: 9 октября 2026.

## Итог

Команда `npm run upload:topic -- <тема>` отправляет три готовых MP4 темы (`out/R-<тема>-h1.mp4`, `-h2`, `-h3`) на Google Drive через rclone, без перекодирования. Перед отправкой команда проверяет, что все три файла есть и они не пустые. Если хотя бы одного не хватает, загрузка не начинается.

Доступ к Google Drive хранится в конфиге rclone на компьютере пользователя, а не в репозитории. Папка назначения задаётся переменной окружения `ROMAN_DRIVE_REMOTE`. Монтаж (`src/`), качество рендера и лимиты не менялись.

**Не проверено в этой среде:** реальная загрузка на Google Drive (rclone не установлен, доступа к диску нет), реальный рендер (нет `node_modules` и видео тем в рабочей копии), запуск на Windows. Логика проверена на заглушке rclone и тестовых файлах (см. «Тесты»).

## Что уже было в ветке (проверено, не переписывалось)

| Файл | Назначение |
|---|---|
| `pv/scripts/render-quality.mjs` | Рендер одной композиции `R-<тема>-h[1-3]` в `out/<композиция>.mp4`: H.264, CRF 18, AAC 192k, `--concurrency=4`. Без лимита 30 МБ, FPS композиции (25). На Windows вызывает `npx.cmd` через shell |
| `pv/scripts/render-topic.mjs` | Проверяет, что тема есть в `TOPICS` (`src/RomanReel.tsx`), и по очереди рендерит h1, h2, h3. При ошибке останавливается |
| `pv/scripts/upload-topic.mjs` | Загрузка трёх MP4 через `rclone copyto` |
| `pv/package.json` | Команды `render:quality`, `render:topic`, `upload:topic` |

## Изменения (коммит `fc2e0f5` и этот отчёт)

| Файл | Изменение |
|---|---|
| `roman-reels/pv/scripts/upload-topic.mjs` | Папка `out/` берётся рядом с `package.json` (через `import.meta.url`), поэтому команда работает из любой текущей папки. Если файлов не хватает, сразу выводится полный список недостающих или пустых. Добавлен флаг `--dry-run`, он передаётся в rclone: показывает, что и куда будет загружено, ничего не отправляя |
| `roman-reels/pv/.gitignore` (новый) | `out/` и `node_modules/`: готовые видео и зависимости не попадут в git |
| `roman-reels/pv/UPLOAD.md` (новый) | Пошаговая настройка rclone и Google Drive для Windows и Linux, переменная `ROMAN_DRIVE_REMOTE`, команды, частые ошибки |
| `roman-reels/AUTOMATION_REPORT.md` (новый) | Этот документ |

Не изменялись: `pv/src/**` (шаблон `RomanReel.tsx`, субтитры, вставки, тайминги), `render-quality.mjs`, `render-topic.mjs`, `package.json`. Ветки `main` и `claude/reels-videophone-footage-xdoy8a` не тронуты.

## Как работает `upload:topic`

1. Проверяет аргумент `<тема>` (`[a-z0-9_-]+`) и переменную `ROMAN_DRIVE_REMOTE` (формат `remote:путь`, например `gdrive:Roman/finished-reels`).
2. Проверяет `pv/out/R-<тема>-h1.mp4`, `-h2.mp4`, `-h3.mp4`: файл существует и размер больше 0. Если нет — выводит список проблемных файлов и завершает работу с кодом 1, ничего не загрузив.
3. Проверяет, что rclone доступен (`rclone version`; на Windows вызывается `rclone.exe`).
4. Для каждого файла выполняет `rclone copyto <файл> <ROMAN_DRIVE_REMOTE>/<тема>/<имя файла> --progress` (плюс `--dry-run`, если указан). Файл копируется побайтно, без перекодирования. При ошибке rclone останавливается и возвращает его код.

Результат на Drive: `<папка из ROMAN_DRIVE_REMOTE>/<тема>/R-<тема>-h1.mp4`, `h2`, `h3`.

## Тесты

Окружение: Linux, Node v22.22.2. Вместо rclone — скрипт-заглушка, записывающий свои аргументы в лог. Видео — тестовые файлы по 1 байту.

| # | Сценарий | Ожидание | Результат |
|---|---|---|---|
| 1 | `node --check` для трёх скриптов | без ошибок | ✅ |
| 2 | Без аргумента темы | подсказка, код 2 | ✅ |
| 3 | Без `ROMAN_DRIVE_REMOTE` | подсказка, код 2 | ✅ |
| 4 | Нет ни одного MP4 | список всех трёх, «nothing was sent», код 1 | ✅ |
| 5 | `h3` нулевого размера | указан только `h3`, код 1 | ✅ |
| 6 | rclone нет в PATH | «rclone is not installed…», код 1 | ✅ |
| 7 | rclone вернул ошибку (код 3) | «Upload failed: …h1», остановка, код 3 | ✅ |
| 8 | `npm run upload:topic -- manychat --dry-run` | 3 вызова `copyto … --progress --dry-run` | ✅ |
| 9 | Запуск из другой папки (`cd /`, полный путь к скрипту) | находит `pv/out/` | ✅ |
| 10 | `npm run upload:topic -- manychat` | 3 вызова `copyto` в `gdrive:Roman/finished-reels/manychat/R-manychat-hN.mp4` | ✅ |
| 11 | `render-topic.mjs foo` | «Unknown topic… Available: kanaly, manychat, otvety, startups», код 2 | ✅ |
| 12 | `render-quality.mjs manychat` (неверное имя) | подсказка, код 2 | ✅ |
| 13 | `git check-ignore pv/out/R-manychat-h1.mp4` | игнорируется | ✅ |

Не выполнялось: реальная загрузка, реальный рендер, запуск на Windows.

## Инструкция запуска

Подробно — в [`pv/UPLOAD.md`](pv/UPLOAD.md). Кратко:

**Один раз:**
```bash
# Windows: winget install Rclone.Rclone     Linux: sudo apt install rclone
rclone config                 # новый remote "gdrive", тип drive, авторизация в браузере
rclone lsd gdrive:            # проверка доступа
cd roman-reels/pv && npm ci
```
Переменная назначения:
```powershell
# Windows PowerShell
setx ROMAN_DRIVE_REMOTE "gdrive:Roman/finished-reels"     # затем открыть новый терминал
```
```bash
# Linux
export ROMAN_DRIVE_REMOTE="gdrive:Roman/finished-reels"
```

**На каждую тему** (из `roman-reels/pv`):
```bash
npm run render:topic -- manychat               # → out/R-manychat-h1.mp4, h2, h3
npm run upload:topic -- manychat --dry-run     # проверка без загрузки
npm run upload:topic -- manychat               # загрузка на Google Drive
```

Входные видео темы (не в git, хранятся на Google Drive):
- `pv/public/rr/<тема>/h1.mp4`, `h2.mp4`, `h3.mp4`, `osnova.mp4` — ролики HeyGen;
- вставки, на которые ссылается тема в `TOPICS` (для `manychat` это `pv/public/ai/mc_*.mp4`).

## Безопасность

- В репозитории нет ключей, токенов и паролей. Авторизация Google хранится только в `rclone.conf` пользователя (`%APPDATA%\rclone\rclone.conf` на Windows, `~/.config/rclone/rclone.conf` на Linux).
- Готовые MP4 и `node_modules` исключены из git через `pv/.gitignore`.

## Что осталось для первого тестового Reel

1. Склонировать репозиторий, переключиться на `automation/roman-reels-v1`, выполнить `npm ci` в `roman-reels/pv`.
2. Положить видео `manychat` (`h1–h3`, `osnova`) в `pv/public/rr/manychat/` и `mc_*.mp4` — в `pv/public/ai/`.
3. Настроить rclone и `ROMAN_DRIVE_REMOTE` (см. выше).
4. `npm run render:topic -- manychat` → посмотреть один MP4 → `upload:topic … --dry-run` → `upload:topic`.

## Замечание (не исправлялось)

`render-quality.mjs` не нормализует громкость. Раньше финальные ролики приводились к −14 LUFS (`loudnorm`), поэтому новые рендеры могут звучать тише прежних. Исправить можно отдельным шагом, который обрабатывает только звук (видео копируется без перекодирования).
