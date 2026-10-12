# Квитанция recording-set.json после четырёх загрузок (Windows)

2026-10-12. Код и автономные тесты. Живой прогон не выполнялся.

Зависимости: ветка содержит PR22 (`feature/windows-source-uploader-20261012`) и слитый в неё PR23
(`feature/codex-four-part-intake`, 1af21b8). Ни один из них не слит в `feature/codex-pipeline`; сливать их
отдельно и раньше этого PR.

## Команда

```text
node scripts/run-source-uploader.mjs receipt --packet C:\путь\packet.json
```

Пакет — явный доверенный четырёхчастный пакет `draftVersion 3.0.0` (FOUR_PART_DRIVE_INTAKE.md). Без `--packet`
или при отсутствии файла: `blocked/packet_missing`, exit 1, Drive не вызывается. Старые/отклонённые тексты не
подставляются, утверждения Романа не создаются и не меняются.

## Порядок

1. `buildFourPartReceipt(packet, journal)` из PR23: ровно четыре `uploaded` записи темы/версии, `textHash` каждой
   назначен в задании ДО загрузки. Старая тестовая загрузка h1 без `textHash` квитанцию не образует.
2. Независимо от журнала читается реальный Drive: цепочка incoming → тема → `v<N>` совпадает с записанной, у
   каждой части тот же file ID, имя `<role>.mp4`, MIME `video/mp4`, родитель, размер, MD5, `sha256Checksum`,
   `appProperties` загрузчика; в каждом слоте ровно один файл. Нет `sha256Checksum` — блок.
3. Под тем же `uploader.lock` и после проверки записи в incoming резервируется Drive ID; он сохраняется в
   `journal-v1.json → receipts["<topic>/v<N>"]` ДО запроса create.
4. Квитанция (только поля receipt v1, `JSON.stringify(…, 2) + "\n"`) создаётся одним multipart-запросом как
   `application/json` под временным именем `.recording-set.json.uploading-<sha16>`; облачный приёмщик такие
   имена не видит.
5. Проверяются размер/MD5/SHA-256/appProperties самой квитанции, затем ещё раз все четыре части и отсутствие
   чужого `recording-set.json`; только после этого rename в `recording-set.json` и финальная проверка.

## Повторы и отказы

| Ситуация | Результат |
|---|---|
| Потерян ответ create | `retry_later`; следующий процесс ищет по сохранённому ID, второй create не делается |
| Повтор после успеха | `already_uploaded`, тот же ID, файлы заново сверяются |
| Чужой `recording-set.json` в папке | до резерва `blocked/receipt_conflict`, ничего не пишется; после — `manual_attention` |
| Наша квитанция изменена в Drive | `manual_attention`, файл не перезаписывается |
| Для слота уже записана квитанция с другими байтами | `manual_attention/receipt_changed` |
| Часть изменена/переименована/перемещена/удалена | блок до upload; между upload и rename — квитанция остаётся под временным именем |
| Отказ авторизации / нет права записи | `auth_failed`, exit 2, журнал не меняется |

`manual_attention` не повторяется автоматически. Ничего не удаляется ни локально, ни в Drive.

## Границы

Облачный intake-state, расписание, автозапуск, HeyGen, рендер и производство не затрагиваются. Квитанция
заявляет привязку частей к тексту, но не доказывает произнесённые слова и не является утверждением.
Облачный приёмщик всё равно скачивает и проверяет SHA/MD5/textHash/decode.

## Проверено

`four-part-receipt-upload.test.mjs`, 10 тестов на fake Drive с реальным `processJob` PR22: эталонная квитанция,
неполный комплект/нет пакета, отсутствующий и неверный `textHash`, шесть видов изменения части и дубль в слоте,
изменение части между upload и rename, checksum квитанции, потеря ответа, повтор новым процессом, три вида
конфликта, отказ авторизации, формат multipart-транспорта. Локально на Windows: 10/10, `source-uploader` 12 pass
(1 skip — нет ffmpeg), `four-part-receipt` 4/5 (тест паритета с Python требует Python, выполняется в CI).

Не проверено: настоящий Drive multipart create с заданным ID и 409 на повторе. Это следующий отдельный
ограниченный живой этап с явным synthetic-пакетом; он никогда не становится утверждённой речью или
production-видео.

## Живой ограниченный тест (2026-10-12, по поручению владельца)

Код ветки на `b6bdba0`. Тема `windows-receipt-test-20261012`, версия 1. Пакет `draftVersion 3.0.0`,
`syntheticFixtures: true`, `productionReady: false`, вымышленные тексты с пометкой «СИНТЕТИЧЕСКИЙ ТЕСТ»,
все варианты `pending_approval`, утверждений нет. Четыре MP4 (360×640, 1,52 с, видео + синус разной частоты)
сгенерированы кодом из BMP-кадров встроенным ffmpeg Remotion; ни одной записи Романа/HeyGen. Пакет, задания,
MP4 и резервная копия журнала лежат вне Git в `%LOCALAPPDATA%\RomanReels\source-uploader\receipt-test-20261012`.
`textHash` каждого задания вычислен из текста пакета до загрузки.

| Шаг | Результат |
|---|---|
| `check-auth` | `incomingVisible=true`, `incomingWritable=true` |
| `run --jobs <тестовая папка> --max 4` (ffprobe + полный decode) | 4 × `uploaded`, exit 0 |
| `receipt --packet` (новый процесс) | `uploaded`, exit 0, ID `1F22PKL-R04ye0yUkcRnCE3ggcBVWbivH` |
| `receipt --packet` повтор (новый процесс) | `already_uploaded`, exit 0, **тот же ID** |

Независимая read-only сверка через Drive API (полный listing папки, скачивание квитанции):

| Файл | Drive ID | Байт | Совпадение |
|---|---|---|---|
| `body.mp4` | `1HG-0o9k9t7wl00_ibBQu7m6czRQgXLMA` | 21 308 | размер/MD5/SHA-256 = локальный файл |
| `hook-1.mp4` | `1C5gKqnxSvLvkDn5Qg3gEZ94sIsqhFbpE` | 21 380 | то же |
| `hook-2.mp4` | `1S7x76f0RHxhhtOjiyuuCOMs8OTQFrV9j` | 21 375 | то же |
| `hook-3.mp4` | `1Q6ZdEgArQte-utBB0Z9VlpkT6ls6W7KJ` | 20 999 | то же |
| `recording-set.json` | `1F22PKL-R04ye0yUkcRnCE3ggcBVWbivH` | 971 | `application/json`; байты = вывод builder; SHA-256 `68193f53…1ef961` = Drive; только поля receipt v1 |

В теме одна папка `v1`, в ней ровно пять файлов, временных `.uploading-*` нет. Старая тестовая папка
`windows-uploader-test-20261012/v1` по-прежнему содержит один `hook-1.mp4` с прежним ID и MD5; её запись в
журнале байт-в-байт совпадает с резервной копией, `textHash` ей не назначался. Ничего не удалялось.

Не выполнялось: облачный приёмщик для этой темы (её нет в packets; `--packets` в workflow не передаётся),
изменение intake-state, HeyGen, автозапуск, монтаж, рендер, производство. Тест не является утверждённой речью
и не даёт права на production. Удалять тестовую папку — только по решению владельца.
