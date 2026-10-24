# Claude P1 — AI Montage Director и RomanFactoryV1 (результат)

Дата: 2026-10-10. Ветка `feature/claude-montage` от `feature/codex-pipeline` @ `3321f05`.
PR в `feature/codex-pipeline` для проверки Codex. `main` не менялся.
Статус: **development**. Не production, не публикация, утверждения Романа не тронуты.

## Обновление после ревью Codex (CODEX_PR6_REVIEW.md, 6652bb9)

**C1 исправлено.** Короткие акценты, которые обрезает следующий акцент, раньше давали Remotion
не возрастающий `inputRange` (пример Codex: Claude [1, 1.1] и Gemini [1.11, 1.2]). Теперь `pv/src/factory/timing.ts`
`fadeKeyframes(start, end, in, out)` уменьшает fade пропорционально длине события:
in + out ≤ 80%, видимое плато ≥ 20%. Точки строго возрастают. Если событие короче точности float,
возвращается null, и событие показывается без fade. Длинные события сохраняют прежние 0,22/0,25 и 0,6/0,6 с.
Тот же helper используется для zoom. Director, речь, тайминги и планы не менялись: план h1 идентичен.

- `timing.test.ts` — 7 тестов, включая вызов Remotion `interpolate` на каждом кадре:
  - воспроизведение примера Codex (старый диапазон бросает исключение, новый — нет);
  - несколько терминов подряд;
  - короткий zoom, обрезанный следующим акцентом;
  - акцент у конца видео;
  - диапазон длин 0,01–3 с;
  - неверный ввод;
  - все события трёх реальных job.
  
  С прежними фиксированными fade 5 из 7 тестов падают.
- Композиция: кадры 23–29 на тестовых props (пример Codex на видео h1) рендерятся без ошибки, fade виден.
  Это проверка, не результат.
- **Звук:** влит `feature/codex-pipeline` @ 6652bb9 (`preserve_source_audio.py`: исходный AAC копируется
  без перекодирования). Контрольный рендер h1 через обновлённый wrapper: technical QC пройден,
  длительность 40,24 с; декодированный PCM выхода совпадает с исходником, сдвиг 0, corr 1,0.
  Ограничение №1 ниже (42,7 мс) этим закрыто. h2/h3 после исправления заново не рендерились.
- Доказательства: `research/first-montage-v1/claude-montage/c1-fix-evidence.json`.

## Что сделано

| Файл | Что |
|---|---|
| `pv/src/factory/director.ts` | `buildMontagePlan(job)` → `{events}` schema v1. Чистый TS: без React/Remotion/CLI, erasable syntax, Codex импортирует через `node --experimental-strip-types`. Также `assertJob`, `validateMontagePlan`, `captionPages`, `activeWordIndex`, ярлыки событий |
| `pv/src/factory/layout.ts` | Консервативная раскладка (полосы, не детекция лица) и подбор размера шрифта субтитров |
| `pv/src/factory/RomanFactoryV1.tsx` | Композиция: полный собранный MP4 + пословные субтитры + акценты из плана |
| `pv/src/factory/director.test.ts` | 14 тестов `node:test` |
| `pv/scripts/build-montage-plan.mjs` | Offline CLI: job → plan JSON, без рендера и сети, не перезаписывает файл |
| `pv/src/Root.tsx` | Добавлена `RomanFactoryV1`. Все 32 прежние композиции сохранены (итого 33) |
| `pv/tsconfig.json` | `allowImportingTsExtensions` (нужно для явных `.ts` импортов, которые требует Node strip-types) |
| `AiReel`, `FaceReel`, `FormulaReel2/3`, `LudiVideo` | Исправлены 8 ошибок tsc из аудита: неиспользуемые переменные и дубли ключей. У дублей оставлено то значение, которое и раньше побеждало (последнее), поэтому вид не меняется |
| `research/first-montage-v1/claude-montage/` | 3 плана, `render-evidence.json`, 3 листа контрольных кадров (JPEG) |

## Director v1: правила, а не «понимание текста»

Детерминированно: случайности и вызовов моделей нет, одинаковый job даёт байт-в-байт одинаковый план.
Поэтому seed не нужен. Все тексты на экране — только произнесённые слова из `wordTimings`.
Сценарий не редактируется, хук повторно не добавляется.

- **Субтитры (`caption`, нижняя полоса).** Страницы до 3 значимых слов; предлоги и союзы из 1–2 букв не считаются. Не больше 22 символов. Разрыв на `.!?`, на запятой (если слов ≥2) и на паузе >0,35 с. Предлог или союз не остаётся висеть в конце страницы. Активное слово — последнее начавшееся слово страницы, жёлтым.
- **Акценты (верхняя полоса), по приоритету.** Новый акцент обрезает «хвост» предыдущего, но не его слова.
  1. `number` — число цифрами + единица («10 секунд»). Числа словами не распознаются.
  2. `diagram` — перечисление в одном предложении: ≥2 запятых и ≥3 коротких пункта. Первый пункт берётся с последнего предлога первой части, последний режется по «и». Пункты появляются в момент произнесения.
  3. `card` — призыв в последних 30% ролика: предложение начинается с «Напиши / Подпишись / Сохрани…».
  4. `keyword` — название инструмента из списка (Claude, Telegram…). Логотипов нет, `visualAssets` пуст.
- **Лимиты.** Не больше ⌊длительность/6⌋ акцентов. Акценты не пересекаются по словам. Один `zoom` (1,05, плавно 0,6 с) только на числе и не раньше 3 с — без резких «панчей».
- **Валидация плана** (и в Director, и перед рендером): каждое событие покрывает `wordStart..wordEnd`, не выходит за duration, assetId только из `visualAssets` (`b_roll` и `interface` без него отклоняются), id уникальны, субтитры не накладываются друг на друга, акценты одной полосы тоже. Неизвестная `schemaVersion`, пустые слова, перекрытия слов, NaN и опасные пути (`/`, `..`, `\`, `:`) отклоняются, данные не «чинятся».

Результат на трёх вариантах — одинаковые акценты основы:
список каналов → Claude → «10 секунд» с zoom → «отзывами / заявками с сайта / коммерческими предложениями / договорами» → «Напиши в комментариях».
В хуке h2 Director дополнительно нашёл перечисление «почте / мессенджерах / комментариях».

## Композиция RomanFactoryV1

- Props = весь job v1. `calculateMetadata`: `ceil(duration*fps)` кадров, 1080×1920. Без job — «Нет проверенного исходника», 2 с. Невалидный job или план → рендер падает с причиной.
- `OffthreadVideo(staticFile(sourceVideo.localPath))` целиком: та же речь, без нарезки и смены скорости. Если `montagePlan` нет, план строит тот же Director.
- Раскладка консервативная, рассчитана по контрольным кадрам этого исходника (лицо и микрофон ≈18–70% высоты). Акценты: safeZone.top+20 … ≈550 px, на уровне кепки, выше глаз. Субтитры: низ на safeZone.bottom+40, не выше ≈1360 px. Автоматической детекции лица **нет**; для другой постановки кадра нужно заново смотреть stills.

## Проверки (выполнено здесь)

| Проверка | Результат |
|---|---|
| `npx tsc --noEmit` | ✅ 0 ошибок (было 8) |
| `node --experimental-strip-types --test src/factory/director.test.ts` | ✅ 14/14: schema, пустые слова, пути, интервалы, детерминизм, 3 реальных job, слова-только-из-речи, одинаковая основа в h1–h3, активное слово на каждом кадре h1 и на границе кадра, паузы и предлоги, длинные русские слова, короткий клип, отсутствие терминов, missing asset, перекрытия |
| `remotion compositions` | ✅ 33 ID (32 прежних + RomanFactoryV1). С props h2 → 1038 кадров = ceil(41,52×25) |
| Codex тесты | ✅ factory-contract 6, factory-media 7, assembled-jobs 4, source-set 4; Node: apify-access 4, apify-one-reel 5, apps-script 10, manual-intake 8, prepare-claude-job 2, prepare-script-review 4, production-queue 12, shared-body-drafts 3 |
| Пересборка по SHARED_BODY_ASSEMBLY.md | ✅ SHA 4 исходников = source-set.json. `assemble-source-set.py`: h1 40,24 / h2 41,52 / h3 38,48 с, стыки 6,52 / 7,80 / 4,76 — как у Codex. `check-assembly-audio.py`: 18 окон прошли |
| Jobs под новую сборку | `prepare-assembled-jobs.py` (не вручную). Отличие от коммита — только `sourceVideo.sha256`; слова и тайминги те же. Планы по коммитнутым и пересобранным job идентичны |
| **Полный рендер** `run-development-montage.py` ×3 | ✅ «Development render and technical QC passed» для h1/h2/h3: decode, 1080×1920, 25 fps, h264/aac, duration в допуске |
| Stills из готовых MP4 | ✅ лицо и микрофон не перекрыты, активное слово совпадает с речью (листы в `claude-montage/`) |
| Неверные props | ✅ `schemaVersion 9.9.9` и `wordEnd 999` → рендер отказал, файл не создан; без props — заглушка |

## Ограничения и что проверить Codex

1. ~~Звук в рендере на 42,7 мс позже исходника~~ — закрыто исправлением Codex (см. выше). Исходная находка: — постоянно во всех трёх (FFT cross-correlation, 12 окон, corr ≥0,965 при этом сдвиге, ≈0 при нулевом). Аудио-дорожка выхода на 0,0587 с длиннее видео. Похоже на неучтённую задержку AAC-кодера в выходе Remotion; сборка Codex на нулевом сдвиге проверена. Это ~1 кадр, субтитры привязаны ко времени исходника. **Не исправлено**: нужно решить на стороне wrapper/QC (например, проверка сдвига в technical QC или ремукс). Обходить молча не стал.
2. MP4 собраны в облачном контейнере Claude: FFmpeg 7.0.2 static (imageio-ffmpeg в venv), ffprobe из Remotion 4.0.527. Байты сборок отличаются от сборок Codex. MP4 не в Git; SHA выходов — в `render-evidence.json`.
3. ASR тексты Codex не проверялись человеком. Director им доверяет и показывает как есть. Например, «Скопируй сообщение клиентов к Claude» отображается дословно.
4. Правила рассчитаны на русскую разговорную речь и этот формат. Числа словами, B-roll, интерфейсы, split-screen и логотипы не реализованы: нет ассетов с правами. `b_roll`, `split_screen` и `interface` в плане сейчас отклоняются как неподдерживаемые.
5. ESLint не запускался: в `pv/` нет `eslint.config.*` (до этой ветки тоже). npm scripts не менял — по ТЗ это делает Codex. Предлагаемые команды:
   - `test:factory`: `node --experimental-strip-types --test src/factory/director.test.ts`;
   - `plan:factory`: `node --experimental-strip-types scripts/build-montage-plan.mjs`.
6. Финальное качество (темп, стиль) требует просмотра владельцем. Technical QC — не `qc_passed`, утверждения Романа не тронуты, ничего не загружено.

## Повторить

```sh
cd roman-reels/pv && npm ci            # или существующие node_modules той же версии
npx tsc --noEmit
node --experimental-strip-types --test src/factory/director.test.ts
node --experimental-strip-types scripts/build-montage-plan.mjs \
  ../research/first-montage-v1/assembled-jobs/R-ai-shared-body-fixture-h1-job.json
cd ../.. && python roman-reels/scripts/assemble-source-set.py \
  roman-reels/research/first-montage-v1/source-set.json --out roman-reels/pv/public/rr/incoming/<new>
# затем prepare-assembled-jobs.py по SHARED_BODY_ASSEMBLY.md и:
python roman-reels/scripts/run-development-montage.py <job.json> --out <new-directory>
```

Не вызывались: платные API, HeyGen, Gemini, Apify, Sheets, Drive, Telegram, публикация.
