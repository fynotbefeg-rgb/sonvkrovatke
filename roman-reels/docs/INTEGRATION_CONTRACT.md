# Контракт Codex ↔ Claude Code — кандидат 1.0.0

Статус: **согласован владельцем 2026-10-10** после PR #5. Production workflow ещё не переведены
на этот контракт; development JSON и интеграционный wrapper используют v1 отдельно.
Файл [factory-job-v1.schema.json](../schemas/factory-job-v1.schema.json) и offline validator
задают проверяемый кандидат; это не deployed production gate.

## Поля и единицы

| Поле | Смысл |
|---|---|
| schemaVersion / mode | `1.0.0`; development или production. Development никогда не основание для публикации |
| reelId / topicId / hookNumber | `R-<topic>-h[1-3]`, существующие идентификаторы; вариант хука — отдельное видео |
| scriptVersion / scriptHash | Положительный revision и legacy SHA-256, точные Unicode-строки без нормализации |
| hookText / scriptText | Точный утверждаемый hook и полный произносимый текст; hook второй раз не добавлять |
| approvalStatus / approval | pending_approval, approved, rejected; actor, timestamp, hash, reference к доверенной квитанции |
| sourceVideo | localPath, checksum SHA-256, duration секунды, width/height/fps; необязательные driveFileId/origin |
| wordTimings | Массив text/start/end в секундах исходного MP4; индекс массива — ссылка для монтажа |
| speechSegments | text/start/end, интервалы речи, не искусственная разбивка по scriptText |
| visualAssets | id/type/localPath/rightsReference. Только локально подготовленные разрешённые ресурсы |
| montagePlan | events: id/type/start/end/wordStart/wordEnd/assetId/animation/position/layer/transition/respectSafeZone |
| renderSettings | 1080×1920, fps, codec h264, audioCodec aac; safeZone в пикселях |
| outputPath / productionStatus / errorDetails | Выход, текущий этап, code/message/retryable; не хранить секреты в ошибках |

Часть полей появляется по стадиям: queued не требует готовых слов или outputPath.
montage_ready/rendered/qc_passed требуют source, слова, сегменты, assets, plan и настройки;
rendered/qc_passed требуют outputPath. qc_passed требует положительный qcReport с проверками
decode/resolution/audio/duration/plan/assets/subtitles и с checksum проверенного выхода.
JSON Schema проверяет структуру; validator дополнительно проверяет hash, reel ID, границы,
порядок слов, anchors и ресурсы. Он **не доказывает личность утверждающего** и не открывает
право запуска: production обязателен свежий authenticated read Sheets на каждой значимой границе.

## Совместимость со старым форматом

Адаптер должен отображать `version_id→reelId`, `topic_id→topicId`, `hook_id→hookNumber`,
`script_revision→scriptVersion`, `hook_text→hookText`, `script_text→scriptText`,
`script_hash→scriptHash`, `status→approvalStatus`; approved_by/at→approval.
Хеш не менять: SHA-256 UTF-8 `JSON.stringify([version_id, script_revision, hook_text, script_text])`.
Изменение любого из этих полей требует нового утверждения, даже если общий смысл тот же.
Python validator использует Node для точного совпадения JSON.stringify, не собственную нормализацию.

production_key = существующий SHA-256 `[version_id, revision, script_hash]`;
intake job_key дополнительно включает Drive file ID и MD5 исходника.
Это разные сущности: один заказ / один набор байтов. SHA-256 sourceVideo добавляется для
проверки скачанного файла; MD5 Drive не переименовывать в SHA-256.
Имена ручных исходников сохраняются: `<version_id>__r<revision>__<full_script_hash>.mp4`.

## Монтажная семантика

На первом этапе монтаж не меняет скорость/порядок речи: source-time = output-time.
Слова идут по времени без перекрытия; события могут перекрываться по разным слоям;
wordStart/wordEnd — включительные индексы. Событие покрывает связанные слова и не выходит за duration.
Точное связывание смысла и речи требует сравнения transcript со scriptText, а не лишь совпадения hash.
safeZone — согласованная геометрия для первого теста, не универсальная гарантия всех Instagram UI.
Проверка реальной отрисовки субтитров/лица производится Remotion-тестами и stills, не одной schema.

## Версии, ответственность и проверка

Codex формирует source/слова/права/статусы; Claude создаёт plan и rendering.
Незнакомый schemaVersion отклонять. Несовместимые changes — новая версия, адаптер, fixtures
и согласованный PR. Никто не исправляет утверждённый scriptText в montage engine.
Настоящий qcReport формирует QC по файлу, а не клиентский запрос/модель.
Существующий код approvals остаётся действующим; новые gates ещё не подключены.

Проверка кандидата: `python -m pip install -r roman-reels/schemas/requirements.txt`, затем
`python roman-reels/scripts/validate-factory-job.py <job.json>`.
Offline тесты: `python roman-reels/scripts/factory-contract.test.py`.
Node требуется только для legacy hash; validator не скачивает модели и не обращается к сети.
