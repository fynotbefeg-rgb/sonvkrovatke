# Приём трёх хуков, общей основы и двух окончаний

Дата проверки: 2026-10-10. Реализован **development-путь**, не запуск производства.
Новые тексты Романа ещё ожидают окончательного утверждения; голос пока не запрашивать.

## Папки и комплект

Создана и прочитана через подключённый Google Drive папка
[incoming](https://drive.google.com/drive/folders/1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ)
в существующей `roman-reels-assets` (`1bLzHi6K1HxXesmRj_dhghCsWk5spcPuf`).
Она пустая. Это входящая папка; готовые работы остаются в прежней finished-папке.
Права сервисного аккаунта GitHub Actions на новую папку пока не проверены;
Drive watcher, скачивание по расписанию и `ROMAN_INCOMING_FOLDER_ID` не настроены.
Доступ через ChatGPT-коннектор не доказывает доступ через rclone/Actions.

После скачивания допустимого комплекта локальная структура:

```text
roman-reels/pv/public/rr/incoming/<topicId>/v<scriptVersion>/
  hook-1.mp4
  hook-2.mp4
  hook-3.mp4
  body.mp4
  ending-instagram.mp4
  ending-tiktok.mp4
  recording-set.json
```

Части — видеозаписи аватара со звуком. Исходные голосовые записи Романа не
являются этими MP4: путь собственного аудио → разрешённая генерация аватара
ещё требуется проверить в HeyGen. Нельзя просто переименовать WAV/M4A в MP4.
Ручной и будущий Windows-путь должны создавать одну и ту же квитанцию.
Создание её автоматически локальным приёмщиком не заменяет проверку фактически
произнесённых слов. Временные файлы и MP4 игнорируются Git.

## Квитанция записей и версии

`recording-set.json` — объект ровно с `receiptVersion: "1.0.0"`, `topicId`,
`scriptVersion` и `files`. `files` содержит ровно шесть уникальных записей с
`fileName`, `sha256` байтов MP4 и `textHash` точного текста части (SHA-256 UTF-8).
Имена — только из списка выше. Пример одной записи:

```json
{"fileName":"hook-1.mp4","sha256":"<64 hex символа реального файла>","textHash":"<64 hex символа текста>"}
```

Это описание формата, не действительная квитанция. Заполнять контрольные суммы
должен приёмщик/Windows-worker после записи и проверки; фиктивные суммы запрещены.
Квитанция не является утверждением Романа и не доказывает совпадение речи с текстом.

`research/incoming-recording-layouts-v2.json` содержит подготовленные задания для
двух тем: точные шесть текстов, имена файлов и их textHash. Статусы pending_approval
сохранены; отдельное утверждение окончаний не делает основы и хуки утверждёнными.
Редакционные packets сопоставляются со всеми шестью полными сценариями и legacy
scriptHash. Изменение текста, темы, ревизии или неправильная квитанция блокирует приём.

## Команды для разработчика

```bash
python roman-reels/scripts/prepare-incoming-source-set.py \
  roman-reels/research/platform-ending-drafts-v2.json \
  --topic ai-seo-audit \
  --incoming rr/incoming/ai-seo-audit/v1 \
  --out /tmp/ai-seo-source-set-v2.json

python roman-reels/scripts/assemble-source-set.py \
  /tmp/ai-seo-source-set-v2.json \
  --out roman-reels/pv/public/rr/incoming/ai-seo-audit/assembled-run-1
```

Когда файлов/квитанции не хватает, приёмщик сообщает `waiting_for_parts`,
перечисляет недостающие имена и не создаёт план. Это результат проверки текущей
папки, а не развёрнутая постоянная очередь. При полном комплекте проверяются
версия, textHash, SHA-256, уникальность путей/байтов, наличие видео/аудио,
длительность и полное декодирование каждого MP4. Выходные файлы не перезаписываются.
Дубликаты и выход через symlink за пределы выбранного комплекта отклоняются.

## Сборка и монтажный контракт

Отдельная `source-set-v2.schema.json` разрешает только development, требует шесть
частей и явную ревизию. Схема v1 остаётся прежней; её три результата совместимы
с существующими командами и fixtures. Editorial draftVersion и media assemblyVersion
— разные форматы, несмотря на одинаковую строку `2.0.0`.

Сборка создаёт `R-<topic>-instagram-h1..h3` и `R-<topic>-tiktok-h1..h3`.
Каждый источник: хук → общая основа → соответствующее окончание, 1080×1920,
25 fps, H.264/AAC. `assembly.json` сохраняет SHA частей, точные textHash,
исходные длительности, bodyStart, endingStart и технический QC каждого результата.
`complete=true` выставляется только после всех шести проверенных результатов.
При ошибке остаются `complete=false` и диагностические/partial файлы.
Это не профессиональный финальный монтаж и не productionReady.

`prepare-assembled-jobs.py` теперь принимает v2 и **реальные** speech artifacts
всех шести частей. Новые аргументы:

```bash
python roman-reels/scripts/prepare-assembled-jobs.py \
  roman-reels/pv/public/rr/incoming/ai-seo-audit/assembled-run-1/assembly.json \
  --body-speech /tmp/body-speech.json \
  --hook-speech /tmp/h1-speech.json /tmp/h2-speech.json /tmp/h3-speech.json \
  --instagram-ending-speech /tmp/instagram-ending-speech.json \
  --tiktok-ending-speech /tmp/tiktok-ending-speech.json \
  --public-directory rr/incoming/ai-seo-audit/assembled-run-1 \
  --out /tmp/ai-seo-six-montage-jobs
```

Адаптер проверяет реальные исходные/собранные файлы, привязывает слова/сегменты
окончания к его началу и создаёт шесть **development/pending_approval** jobs.
Старые тайминги нельзя использовать для новой речи или добавленного окончания.
Это перенос таймингов частей, а не повторный ASR/forced alignment собранного звука.
Transcript не подменяется редакционным текстом; нужна отдельная сверка человеком.

Factory job schema остаётся `1.0.0`, `topicId` включает площадку; Director получает
цельный источник и слова. Platform/provenance сохраняются в sidecar, неизвестные
поля не добавляются в контракт Claude. Требуется последующий реальный тест
Director/Remotion по каждому новому сценарию; на этом этапе проверена сборка/QC
и совместимость jobs, новый финальный ролик Романа не отрендерен.

## Проверки и ограничения

`platform-source-set.test.py`: десять тестов, шесть реальных синтетических MP4.
Проверяется порядок кадров во всех вариантах, общий body, разные окончания,
1080×1920/звук/длительность/decode, версии/textHash/повреждение/нет аудио,
ожидание неполного комплекта, запрет перезаписи, изменение исходника во время
сборки, реальные part offsets и шесть валидных contract jobs. Речь/тайминги
fixtures синтетические, нейросети не вызывались. Legacy suites: 5 source-set,
4 assembled-job. Дополнительно проверяется контракт и общий media module.
Результат сохранён в `research/six-part-intake-test-report.json`: десять новых тестов
прошли, шесть синтетических сборок с QC/checksums и отметкой удаления временных fixtures.
Всего прошли 35 Python-тестов и два JavaScript test-файла (6 ending/3 shared-body сценария).

Следующий шаг: проверенный Drive → локальный комплект adapter и production gate
для полного актуального текста. Нужны доверенное утверждение всех частей,
сверка речи, долговечный журнал/lock, кнопка Telegram, финальный render/QC/upload.
Live Google approvals, Telegram, ManyChat, Windows и HeyGen не менялись.
