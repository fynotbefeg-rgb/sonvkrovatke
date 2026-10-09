# Roman Reels — тестовый рендер в облаке (этап 2)

Ветка: `automation/roman-reels-v1`. Дата: 9 октября 2026.

## Итог

Добавлены 2 файла:
- workflow `.github/workflows/roman-reels-render-test.yml`;
- скрипт `roman-reels/pv/scripts/check-assets.mjs`.

Workflow запускается **только вручную** (`workflow_dispatch`). Он:
1. скачивает с Google Drive исходные MP4 одной композиции (по умолчанию `R-manychat-h1`) через rclone, с доступом только на чтение;
2. проверяет, что все исходники на месте;
3. рендерит MP4 существующим `npm run render:quality` (H.264, CRF 18, AAC 192k, 25 fps, без лимита 30 МБ);
4. сохраняет файл как artifact GitHub Actions на 3 дня.

Монтаж (`pv/src/**`), `render-quality.mjs`, `render-topic.mjs`, `upload-topic.mjs` и другие ветки не менялись.

**Рендер в облаке не запускался.** Доступ к Drive ещё не настроен, а без него workflow останавливается на первом шаге. Кроме того, кнопка запуска появится только после добавления файла workflow в `main` (см. «Запуск»).

## Как это устроено

### Доступ к Google Drive
- Используется **сервисный аккаунт Google** — отдельный технический «пользователь» с JSON-ключом. Его можно создать с iPhone в браузере. Обычной авторизации rclone нужен компьютер (`rclone config`/`rclone authorize`), поэтому вариант с сервисным аккаунтом удобнее.
- Сервисному аккаунту даётся доступ **«Читатель» только к одной папке** с исходниками. Остальной Диск ему не виден.
- В rclone задан scope `drive.readonly`, то есть только чтение.
- Конфигурация rclone задаётся переменными окружения (`RCLONE_CONFIG_GDRIVE_*`) только на шаге скачивания. Файл с токенами не создаётся: используется пустой `rclone-empty.conf` во временной папке раннера.
- Ключ хранится только в **GitHub Secrets** (`GDRIVE_SA_JSON`). GitHub маскирует значения секретов в логах. Workflow не выводит конфиг, rclone работает с уровнем логов `NOTICE`.
- ID папки — в **GitHub Variables** (`ROMAN_ASSETS_FOLDER_ID`). Это не секрет: без ключа доступа он бесполезен.
- `permissions: contents: read`. Workflow ничего не пушит и не пишет на Drive.

### Ожидаемая структура папки на Google Drive
Папка, ID которой указан в `ROMAN_ASSETS_FOLDER_ID`, должна повторять `roman-reels/pv/public/`:
```
<папка>/
├── rr/
│   └── manychat/
│       ├── h1.mp4        ← копия «Хук1.mp4»
│       └── osnova.mp4    ← копия «Основа1.mp4»
└── ai/
    ├── mc_open.mp4       ← 6 файлов из архива roman-reels-tolko-iz-oblaka.zip
    ├── mc_tpl.mp4
    ├── mc_kw.mp4
    ├── mc_dmtext.mp4
    ├── mc_type.mp4
    └── mc_result.mp4
```
Для `R-manychat-h2`/`h3` дополнительно нужны `rr/manychat/h2.mp4`, `h3.mp4` («Хук2», «Хук3»).
Для темы `startups` — `rr/startups/h1..h3.mp4` и `osnova.mp4`; скриншоты `ai2/*.jpg` уже есть в git.

### Какие файлы нужны композиции
`scripts/check-assets.mjs` читает `src/RomanReel.tsx` как текст и составляет список: хук темы, `osnova.mp4`, все видео-вставки (`phone`), скриншоты (`web`) и SVG-логотипы.
- `--list` — только вывести список.
- Без флага — проверить, что каждый файл есть в `public/` и не пустой. Если файлов не хватает, выводится список и код выхода 1.

Workflow скачивает с Drive только то, чего нет в git.

### Шаги workflow

| # | Шаг | Режим |
|---|---|---|
| 0 | Проверка имени композиции (`^R-[a-z0-9_]+-h[123](-ph)?$`) и наличия секрета и переменной. Если их нет — ошибка «Доступ к Google Drive ещё не настроен… Рендер не запускался», дальше ничего не выполняется | всегда |
| 1–3 | Checkout, Node 22 (кэш npm), `npm ci` | всегда |
| 4 | Установка rclone из репозитория Ubuntu (`apt-get install rclone`) | всегда |
| 5 | Список недостающих в git файлов (`check-assets.mjs --list`) | всегда |
| 6 | `rclone copy gdrive: public --files-from <список>` — только нужные файлы, только чтение | всегда |
| 7 | `node scripts/check-assets.mjs <композиция>` — если чего-то нет, работа прекращается | всегда |
| 8 | `npx remotion browser ensure` | `render` |
| 9 | `npm run render:quality -- <композиция>` → `out/<композиция>.mp4` | `render` |
| 10 | Размер, кодеки, разрешение, fps и длительность (`npx remotion ffprobe`) | `render` |
| 11 | Artifact `<композиция>` с MP4, без повторного сжатия, хранение 3 дня | `render` |

Поля запуска:
- `composition` — по умолчанию `R-manychat-h1`;
- `mode` — `check-sources` (по умолчанию: только скачать и проверить исходники, без рендера) или `render`.

## Проверки (локально, Linux, Node v22.22.2)

| Проверка | Результат |
|---|---|
| YAML разбирается (PyYAML 6.0.1), триггер только `workflow_dispatch`, 12 шагов; шаги 8–11 выполняются только при `mode == 'render'` | ✅ |
| `node --check scripts/check-assets.mjs` | ✅ |
| `check-assets --list R-manychat-h1` → 10 путей (2 видео HeyGen, 6 `mc_*`, 2 SVG) | ✅ |
| `check-assets --list R-startups-h2-ph` → `rr/startups/h2.mp4`, `osnova.mp4`, 6 скриншотов `ai2`, 2 SVG | ✅ |
| `check-assets` с неверным именем / неизвестной темой | ✅ код 2 |
| `check-assets R-manychat-h1` в репозитории без видео | ✅ 8 × MISSING, «Render cancelled», код 1 |
| Шаг 0: нет секрета / нет ID папки / имя `R-x; rm -rf /` | ✅ понятная ошибка, код 1 |
| Шаг 0: всё задано | ✅ код 0 |
| Шаг 5: список скачивания для `R-manychat-h1` | ✅ ровно 8 файлов (SVG из git не качаются) |
| Шаг 6 на заглушке rclone (копирует из локальной копии исходников, проверяет, что заданы `TYPE=drive`, `SCOPE=drive.readonly`, ключ и ID папки) | ✅ вызов `rclone copy gdrive: public --files-from …`; без ключа в окружении — ошибка |
| Шаг 7 после «скачивания» | ✅ все 10 файлов на месте (реальные размеры: h1 11,0 МБ, osnova 53,0 МБ, mc_* 0,1–2,8 МБ) |
| Тестовое значение секрета в выводе шагов и в аргументах rclone | ✅ не найдено |
| Рендер с этими исходниками: `R-manychat-h1`, кадры 0–49, те же параметры, что у `render:quality` (CRF 18, AAC 192k, concurrency 4) | ✅ 19 с, 2,5 МБ; кадр: хук, плашка и субтитры на месте |
| Шаг 10 на результате | ✅ h264, 1080×1920, 25/1, aac |

**Не проверено:**
- запуск в GitHub Actions;
- реальный доступ сервисного аккаунта к Drive;
- `apt-get install rclone` на раннере;
- `npx remotion browser ensure` на раннере;
- полный рендер всех ~2043 кадров в облаке;
- загрузка artifact.

Локально использовались уже установленные пакеты Remotion 4.0.527 и локальный Chrome Headless Shell.

## Что настроить (можно с iPhone)

### 1. Папка с исходниками на Google Drive (приложение Google Диск)
1. Создай папку, например `roman-reels-assets`. Внутри — папки `rr`, в ней `manychat`, и рядом `ai` (структура выше).
2. В `rr/manychat/` положи копии «Хук1.mp4» и «Основа1.mp4» и переименуй их в `h1.mp4` и `osnova.mp4`. Делается через «⋮ → Создать копию», затем «Переместить» и «Переименовать».
3. Архив `roman-reels-tolko-iz-oblaka.zip`: в приложении «Файлы» нажми на него, и он распакуется. Загрузи 6 файлов из `pv/public/ai/` в папку `ai/` на Drive.
4. Открой папку `roman-reels-assets` → «Поделиться» → «Копировать ссылку». ID папки — часть ссылки после `/folders/` и до `?`.

### 2. Сервисный аккаунт Google (Safari → console.cloud.google.com, лучше в режиме «Версия для ПК»)
1. Создай проект, например `roman-reels`.
2. «APIs & Services» → «Library» → **Google Drive API** → **Enable**.
3. «IAM & Admin» → «Service accounts» → **Create service account**, имя `roman-reels-render`. Роли проекта не нужны.
4. Открой созданный аккаунт → «Keys» → **Add key → Create new key → JSON**. Файл скачается в «Файлы» → «Загрузки».
5. Скопируй email аккаунта, он вида `roman-reels-render@<проект>.iam.gserviceaccount.com`.

Для обычного Gmail-аккаунта создание ключей обычно доступно. Если Google Cloud скажет, что ключи запрещены политикой организации, этот способ не подойдёт — напиши, подберём другой.

### 3. Доступ к папке
В Google Диске на папке `roman-reels-assets` → «Поделиться» → добавь email сервисного аккаунта с ролью **«Читатель»**. Только к этой папке.

### 4. GitHub (Safari, «Версия для ПК»): репозиторий → Settings → Secrets and variables → Actions
1. Вкладка **Secrets** → New repository secret:
   - Name: `GDRIVE_SA_JSON`
   - Secret: всё содержимое JSON-файла. Открой файл в «Файлах», выдели весь текст и скопируй.
2. Вкладка **Variables** → New repository variable:
   - Name: `ROMAN_ASSETS_FOLDER_ID`
   - Value: ID папки из шага 1.4.
3. После этого **удали JSON-файл** из «Загрузок» на iPhone и не пересылай его никому, в том числе в чат.

Если ключ куда-то утёк: Google Cloud → сервисный аккаунт → Keys → удалить ключ и создать новый, затем обновить секрет в GitHub.

### 5. Кнопка запуска
GitHub разрешает ручной запуск только для workflow, файл которого есть в `main`. Сейчас `roman-reels-render-test.yml` есть только в `automation/roman-reels-v1`. Нужен такой же PR из одного файла, как #3, для проверочного workflow.

## Запуск (после настройки и добавления workflow в main)
1. Actions → «Roman Reels — тестовый рендер (ручной запуск)» → **Run workflow**.
2. «Use workflow from»: `automation/roman-reels-v1`.
3. Сначала `mode = check-sources`: проверка доступа и скачивания без рендера, около 2–4 минут (оценка).
4. Затем `mode = render`, `composition = R-manychat-h1`. Готовый MP4 — внизу страницы запуска в разделе **Artifacts**. На iPhone artifact скачивается как ZIP, внутри MP4.

## Стоимость и ограничения
- Репозиторий публичный, стандартные раннеры `ubuntu-latest` бесплатны. Платные раннеры не используются. Google Drive API для чтения своих файлов бесплатен.
- Время рендера одного Reel около 80 с на раннере с 4 vCPU — оценка 10–20 минут, замера в облаке ещё не было. Тайм-аут задания — 60 минут.
- Artifact хранится 3 дня. Для `R-manychat-h1` ожидается около 40–50 МБ: прошлый рендер этой композиции в CRF 18 весил 45 МБ.
- Сервисный аккаунт здесь только читает. Для будущей выгрузки готовых роликов на Drive понадобится отдельная настройка с правом записи: у сервисных аккаунтов нет собственного места на обычном Диске.
