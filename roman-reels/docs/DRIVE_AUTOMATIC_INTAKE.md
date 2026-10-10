# Облачный приём incoming и постоянный журнал

Дата: 2026-10-10. Реальный доступ и запись журнала проверены через GitHub Actions.
Реальный приём синтетического комплекта проверен отдельно от текстов/утверждений Романа.
Расписание ещё не включено; полное производство и кнопка Telegram не подключены.

## Что сделано

- `drive_intake_client.py`: Drive API, ограниченное потоковое скачивание по **file ID**,
  а не только имени, обновление существующего JSON, отсутствие слепого повтора записей.
- `drive_intake.py`: обнаружение известных topic/vRevision папок, комплектность,
  ограничение размеров, MD5/размер/метаданные до и после скачивания, SHA/textHash,
  полный decode шести частей, source-set fingerprint, leases, retries и handoff.
- `drive_intake_store.py`: постоянный журнал в одном user-owned JSON на Drive,
  проверка доступа и контрольной суммы содержимого перед записью и после неё.
- `run-drive-intake.py`: один ограниченный облачный проход с доверенным read-only
  Apps Script approval reader. Не вызывает Avatar/ASR/Director/Remotion/upload готового видео.
- `check-drive-intake-access.py`: проверка фактической credential/папки без вывода ключа.
- `drive-intake.test.py`: 13 локальных тестов с настоящими синтетическими MP4 и fake Drive.
- `roman-reels-check.yml`: зарегистрированный workflow получает режимы access/scan/self-test.
  `roman-source-set-tests.yml` включает новую suite. Никаких новых платных API.

## Доступ и папки

Incoming: `1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ`, parent assets:
`1bLzHi6K1HxXesmRj_dhghCsWk5spcPuf`.

Используется существующий `GDRIVE_SA_JSON`. Аккаунт
`roman-reels-render@roman-reels.iam.gserviceaccount.com` имеет reader на входящих
файлах по унаследованному доступу и writer **только** на служебном JSON:

- `_pipeline-state`: `1PojAtqPHjfg_uknzp66sOuZcoFVQqbhE` в assets;
- `intake-state-v1.json`: `1hOa9obXHrlj-BKQw9vTfHYoUJ6gp5EYP`, user-owned;
- это не finished-папка и не временный GitHub artifact.

Ключ читается нормальным Google SDK из существующего secret; в Git его нет.
Service account не создаёт новые Drive-файлы, поэтому не требуется его собственная
квота My Drive. OAuth `RCLONE_CONFIG` читает account fynotbefeg@gmail.com, но новый
incoming возвращал 404 по этому пути. Не считать его автоматически пригодным для
новых файлов; действующий credential для этого приёмщика — проверенный service account.

## Журнал и единственный писатель

Google API в реальной проверке не вернул ETag. Нельзя выдавать эту интеграцию за
распределённый CAS-lock. Используется **один Actions-writer**: фиксированный job
`concurrency.group: roman-drive-intake-single-writer-v1`, cancel-in-progress=false.
Перед каждой записью сверяется SHA-256 текущих JSON-байтов, после — полный readback.
Управляющая последовательность и source leases сохраняются до скачивания.
Drive version меняется также по метаданным, поэтому journal revision основана на
содержимом. Без ETag и явного single-writer режима код отказывается писать.
Это не атомарная блокировка между произвольными внешними приложениями.

Windows/Telegram не должны напрямую записывать этот JSON. Они отправляют заявки
этому единственному облачному процессу. Перед появлением других writers потребуется
настоящий transactional backend/распределённый lease. Runtime flags не заменяют
права ОС/Google; секрет доступен только доверенным workflow, не PR коду из fork.

Хранится: topic/revision, ID/MD5/version файлов, SHA скачанных частей, textHash,
scriptHashes/variant IDs, fingerprint, стадия, попытки, срок lease, диагностический
код. Сам текст сценария, Google tokens/cookies в журнал не записываются.

Повтор одного и того же **проверенного** комплекта не скачивает файлы заново и
не создаёт ещё одно задание. Изменение ID/версии/MD5/квитанции/сценарного hash
создаёт новый input key, предыдущий комплект становится superseded. Удаление части
снимает готовность старого комплекта. Это дедупликация входов, а не уже завершённых
профессиональных рендеров. Журнал готовых output ID/QC ещё потребуется.

Lease=30 минут; общий workflow timeout=25 минут. Незавершённое скачивание может
возобновиться после истечения lease, максимум три попытки. Сетевые ошибки повторяются;
ошибки содержимого/доступа требуют исправления входов, без бесконечных повторов.
Partial-файлы не становятся готовыми источниками. Ошибки сохраняются и делают
workflow красным; ожидание отсутствующих файлов является нормальным результатом.

## Утверждения и передача следующему этапу

После download/decode прочитывается authenticated production queue через прежний
`check-production-queue.mjs`. Для готовности необходимы **все шесть** точных полных
Instagram/TikTok текстов с теми же revisions/hash и receipt fields. Ни утверждение
темы, ни отдельное утверждение окончаний этого не заменяют. При недоступности
очереди готовность блокируется. Повторный проход проверяет отзыв утверждения.

Состояния: downloading → awaiting_approval либо source_set_ready. source_set_ready
— handoff с проверенными ссылками/хешами входов для сборки и последующей сверки
речи. `renderAllowed=false` остаётся во всех состояниях. **Запуск сборщика/ASR/
Director/Remotion в этом workflow ещё не подключён**, готовый ролик не создаётся.
Следующий исполнитель обязан повторить проверку утверждения и bytes перед работой.

Квитанция recording-set.json должна формироваться uploader/Windows adapter согласно
INCOMING_SIX_PARTS.md. Эта декларация не доказывает, что записанная речь совпадает с
текстом. Самостоятельная загрузка шести произвольно названных MP4 не даёт права
подставить им выдуманные утверждения. Текущие packets фиксированы на двух темах;
динамический approved-theme/Gemini registry ещё не подключён.

## Проверки

Access run `38055396490`: service-account reader увидел incoming; входящих файлов тогда не было.
Scan `38056048020`: постоянный журнал реально обновлён, темы ожидают части.
Live fixture `38056542414`: семь реальных Drive-файлов (шесть MP4 и receipt, около 26 КБ)
скачаны новым API-клиентом, проверены MD5/SHA/textHash/decode; downloadedSets=1,
awaiting_approval, renderAllowed=false. Это synthetic tones/frames, не голос Романа.
На итоговом коде `f4a0030` run `38057029342` заново проверил fixture и записал
все шесть SHA/textHash (downloaded=1, skipped=0, stateSequence=11).
Новый runner `38057142491` прочитал тот же Drive-журнал: downloaded=0, skipped=1,
stateSequence=12, тот же pending статус. CI `38056939217`: **48 Python-тестов и
оба JS-файла прошли**. Итог: `research/drive-intake-integration-report.json`.

Fixture `intake-self-test-20261010/v1` расположена отдельно в incoming и игнорируется
обычным scanner. Её можно повторить только opt-in self-test режимом; synthetic flag
всегда блокирует утверждение и вызов approval reader. Failed synthetic diagnostics
можно сбросить в этом режиме, реальные jobs/validated fixtures не сбрасываются.

Локальная suite проверяет: потерю файлов runner/restart, один input key, все шесть
утверждений и отзыв, изменённый Drive source, удалённую часть/неоднозначные имена,
повреждённое/неполное скачивание, смену версии во время передачи, retry limit,
истечение lease, повреждённый журнал, stale writer и отсутствие ETag.

## Расписание — включено с разрешения владельца

2026-10-10 владелец разрешил единственное изменение main: новый файл
`.github/workflows/roman-intake-scheduler.yml`. PR #7 слит merge commit
`534f9cc39403a292d3bc563dd1a3639df004a251`; diff подтверждён: один новый файл,
32 строки. Каждые три часа, в :17 UTC, dispatcher запускает bounded scan
на feature/codex-pipeline. Секреты и конвейер в main не переносились.
Первый ручной запуск именно dispatcher: Actions 38059552695 — success;
порожденный intake 38059561816 — success. Cron ещё не наблюдался сам по себе;
GitHub может задерживать расписание. Нет платных API, HeyGen или рендера.
Ориентир пустых проверок 200–300 runner minutes/месяц; тариф и остаток
не проверены. Это периодический scan, не непрерывный сервер.

## Редакционный запрет текущих основ

По сообщению Романа обе основы revision 1 на доработке. Точные идентификаторы
и hashes: research/roman-editorial-feedback-v1.json. Scanner до скачивания
и чтения утверждений сообщает awaiting_script_revision; существующий ready
handoff этого slot становится superseded. Темы/хуки/окончания в Google не
перезаписываются. Этот запрет не является подтверждением личности в Google.
Новая речь требует новой версии и обычного полного утверждения.

Следующий этап после утверждений: реальный approved handoff → assembly → речь/сверка
→ существующий Director/Remotion → финальный QC/Drive output, затем кнопка Telegram.
