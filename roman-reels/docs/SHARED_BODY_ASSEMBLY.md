# Сборка: 3 отдельных хука + одна общая основа

Требование владельца 2026-10-10 реализовано для технической сборки источников.
Одна тема — четыре исходных файла; результат — три независимых MP4:

```text
hook-1 + body → reel-h1
hook-2 + body → reel-h2
hook-3 + body → reel-h3
```

Это этап подготовки источника **до** анализа речи, AI Director и профессионального Remotion-монтажа.
Цельный MP4 на входе также поддерживается. Никакого повторного озвучивания хука внутри основы.

## Что работает и проверено

- `scripts/assemble-source-set.py`: source-set v1, ровно hooks 1/2/3, один body, SHA всех четырёх
  файлов, безопасные локальные пути, probe и полный decode до сборки.
- FFmpeg нормализует 1080×1920/25fps/H.264/AAC/stereo 48kHz, склеивает hook перед body,
  выставляет постоянный FPS. Нет музыкального/визуального монтажа на этом шаге.
- Длительность каждой части округляется вверх до кадра; добавляется не более одного кадра
  удержания последней картинки/тишины. Речь не ускоряется и не обрезается намеренно.
  Метаданные originalDuration и timelineStart/End сохраняют соответствие частей и стыка.
- До/после обработки проверяются checksum частей. QC выходов проверяет decode, resolution,
  audio, duration, fps, codecs. Только прошедший QC partial получает окончательное имя.
- manifest `complete=true` появляется только после успеха всех трёх вариантов.
  Незавершённый набор/partial нельзя передавать дальше. Повторный запуск в ту же папку запрещён;
  файлы не перезаписываются. Глобальная durable дедупликация остаётся задачей облачной очереди.
- Реальные файлы из существующего `ai/h1.mp4`, `h2.mp4`, `h3.mp4`, `body1.mp4` собраны:
  h1 40.240 с, h2 41.520 с, h3 38.480 с. Все три технические QC прошли.
  Evidence: `research/first-montage-v1/source-set.json`, `shared-body-assembly.json`.
  Это development fixture, не утверждённый production комплект.
- MP4 доступны локально в `pv/public/rr/incoming/shared-body-test/`, Git их игнорирует.
  Локальная incoming создана с README/.gitignore; настоящая Drive incoming пока не подключена.

Четыре новых integration tests проверяют три настоящих encode/concat выхода, разные цветовые хуки
до стыка и одинаковую основу после стыка, checksum, audio/QC, missing/duplicate hooks,
production gate, изменённые байты и запрет перезаписи. Тесты проходят.

## Источник сценариев и утверждение

Будущая Gemini генерация теперь запрашивает один `body_text` и три `hook_text`.
`shared-body-drafts.mjs` создаёт legacy-compatible полные `script_text = hook_text + '\n\n' + body_text`.
Каждый полный сценарий 100–160 слов, статус pending_approval. Root `source_sets` сохраняет общий
текст/его SHA и связь с версиями. Три offline теста проходят; реальный Gemini не вызван.
Ранее созданные/утверждённые сценарии не изменены.

Роман по-прежнему утверждает **каждый полный вариант** в Sheets. Общая основа не даёт автоматического
утверждения всем хукам. Изменение основы меняет хеш всех трёх полных сценариев и требует повторного
утверждения всех затронутых вариантов; изменение одного хука затрагивает его вариант.
Производственный worker должен перед сборкой/рендером заново читать доверенные current receipts,
проверять полный точный script, body text/revision/hash, hook text/revision/hash и соответствие речи.
Имя файла и source SHA не доказывают утверждение сценария.

## Контракт и запуск

Отдельная [source-set-v1.schema.json](../schemas/source-set-v1.schema.json) не меняет согласованный
Factory Job v1: после сборки у него обычный цельный sourceVideo. Исходные четыре части и карта стыков
сохраняются отдельным assembly manifest. Нельзя молча заменять source SHA исходного body на SHA сборки.
В этом первом CLI mode допускается только development; production намеренно блокируется,
пока нет живого approved intake для четырёх частей.

```sh
python roman-reels/scripts/assemble-source-set.py \
  roman-reels/research/first-montage-v1/source-set.json \
  --out roman-reels/pv/public/rr/incoming/new-source-set-run
python roman-reels/scripts/source-set.test.py
node roman-reels/scripts/shared-body-drafts.test.mjs
```

Реализован второй путь: реальные hook ASR (14/18/10 слов) + проверенный body cache (81 слово).
`prepare-assembled-jobs.py` проверяет SHA оригиналов и сборок, metadata/QC, порядок частей,
границы и нормализацию карты, затем сдвигает основу на 6.52/7.80/4.76 с.
Запись происходит после проверки всех трёх вариантов, существующая папка не перезаписывается.
В `research/first-montage-v1/assembled-jobs/` три полных job v1 и sidecar speech evidence:
95/99/91 слово, ASR-текст сохранён, все pending_approval/development. Это не утверждённые сценарии.
Сырые hook ASR находятся в `research/first-montage-v1/hooks/h{1,2,3}/speech.json`.
Основа — `aligned-speech.json`; источник методов и ограничений — FIRST_MONTAGE_P1.md.

```sh
python roman-reels/scripts/prepare-assembled-jobs.py \
  roman-reels/research/first-montage-v1/shared-body-assembly.json \
  --body-speech roman-reels/research/first-montage-v1/aligned-speech.json \
  --hook-speech roman-reels/research/first-montage-v1/hooks/h1/speech.json \
    roman-reels/research/first-montage-v1/hooks/h2/speech.json \
    roman-reels/research/first-montage-v1/hooks/h3/speech.json \
  --public-directory rr/incoming/shared-body-test --out /tmp/new-assembled-jobs
python roman-reels/scripts/check-assembly-audio.py \
  roman-reels/research/first-montage-v1/shared-body-assembly.json \
  --public-directory rr/incoming/shared-body-test --out /tmp/new-audio-mapping.json
python roman-reels/scripts/assembled-jobs.test.py
```

Звуковая диагностика: 18 окон по одной секунде (начало/середина/конец каждой части в каждом варианте),
decoded mono PCM 16 kHz, Pearson correlation без подбора задержки, порог >0.95.
`verified-audio-mapping.json`: все окна прошли, минимальная корреляция 0.999747.
Это подтверждает выборочные смещения исходного звука, не точность распознанных слов и не весь звук.
Кешированные тайминги не являются новым распознаванием всей сборки; нужен speech/visual review.
Claude получает уже собранный полный source и не должен повторно склеивать hook/body в Remotion.

## Остаточные ограничения

Drive watcher пока ожидает цельные входы; приём четырёх Drive частей ещё не подключён.
Их реальные file IDs/checksums/versions и incoming folder access нужно проверить до production.
Собранные development имена без approval hash не совместимы с production naming gate и не обходят его.
Нужны live approval binding, проверка распознанного текста, доставленный Claude Director/Remotion, финальный QC.
Новые цельные исходники — не профессионально готовые Reels, нет upload/публикации/Sheets ready.
