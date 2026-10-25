# Telegram production panel — candidate, not deployed

Owner goal: start approved work with one button, see Roman's decisions and see
which videos are actually being created. This change adds the authenticated
Telegram transport and panel around the existing SQLite production queue.
It is not a completed autonomous video factory.

## Implemented behavior

- `/start` or `/run`: a menu and, when current Google approvals exist, one short
  `Запустить` ticket for up to ninety approved variants. No approval data in callback.
- Button: re-read Google, verify the frozen revisions/hashes, atomically enqueue
  through existing `handleVerifiedStart` / `ProductionQueue`. It never approves
  on Roman's behalf. Repeat delivery, double click and restart do not duplicate jobs.
- `/approvals`: paginate the current approved variant IDs/revisions, ten per page.
  No full scripts or approver identities are sent to Telegram.
- `/production`: paginate this coordinator's actual jobs. Existing states are
  waiting for source files or waiting for a Windows worker. They are explicitly
  shown as waiting, never as active avatar generation or montage.

Original source limitation: `get_production_queue` contains only approved
variants. It cannot distinguish rejected items from items awaiting a decision,
and it does not expose the separate topic/body/hook review statuses. The panel
states this limitation. No pending/rejected decision is inferred from absence.
Full component status needs a new authenticated read-only Google contract and a
separate reviewed deployment. The candidate in REVIEW_STATUS_PANEL.md adds this
display endpoint and runtime reader; it still requires a Google deployment and
bot update before those statuses are available live.

The button currently **queues waiting work only**. It does not publish a Windows
source plan, create speech in HeyGen, upload sources, finalize a receipt, render,
or expose finished links. Runtime worker state and output/result links are not
connected. There are no fabricated `rendering`/`done` statuses or fake links.
The queue's current per-variant manual provider also does not by itself implement
the new shared-body four-part worker. That integration remains separate.

## Authentication and durable delivery

`telegram-bot-api.mjs` talks only to fixed `https://api.telegram.org` Bot API
methods through POST, rejects redirects, bounds response bytes, and removes
token-containing details from errors. The transport does not retry its own calls.
The candidate in TELEGRAM_RECOVERY.md retries whole polling cycles for transient
errors in continuous mode, retaining cursor/queue guards; one-poll probes and
terminal errors still stop. `getUpdates` allows only messages and callbacks, twenty per poll.

Only objects actually returned by that authenticated polling instance gain local
WeakSet provenance; copied objects or arbitrary HTTP JSON are rejected by the
panel. Authorized numeric operator IDs and private same-user chats are required.
Unknown senders get no response and no private data. This is not an HTTP webhook
handler and there is no public listener or open port.

SQLite retains the polling cursor by authenticated bot ID. The cursor advances
only after handling and replies complete. A lost reply can replay the event,
but queue production keys and callback receipts prevent another job. A status
message may be sent again after a lost response; Telegram message delivery is
not claimed to be exactly once. Start receipts do not substitute for fresh
approval verification on a later worker claim.

## Runtime setup — choose and approve the coordinator first

No token, operator IDs, host, startup task, webhook or live bot has been configured.
This PR makes no live Telegram call. The owner may create a bot in BotFather;
share only its public username in chat. Enter its token privately at deployment.

The bot must run on one persistent trusted coordinator with the existing protected
Google approval access. Do not run SQLite on disposable Actions runners, synchronize
it with Drive, or copy GitHub/cloud secrets onto Windows. Windows' uploader OAuth
does not automatically authenticate the Apps Script approval endpoint. Selecting
a host and a permitted approval-access path is required before deployment; the
entrypoint intentionally refuses Actions and unapproved deployment.

After agreement, the coordinator requires these private environment settings:

- `TELEGRAM_BOT_TOKEN` and comma-separated `TELEGRAM_OPERATOR_IDS`;
- existing `ROMAN_REELS_WEBHOOK_URL` / `ROMAN_REELS_WEBHOOK_TOKEN`;
- `ROMAN_TELEGRAM_QUEUE_PATH`: absolute private persistent `.sqlite` path;
- `ROMAN_TELEGRAM_DEPLOYMENT_APPROVED=true` only after deployment approval.

Node >=22.13. The database contains stored approved scripts; keep it and backups
private and outside Git/Actions artifacts. A process lock allows one polling
instance for the database. An interrupted process can leave a stale lock; inspect
before manually removing it. No recovery routine silently clears locks or DBs.

Explicit one-poll probe:

```sh
node roman-reels/scripts/run-telegram-panel.mjs --once
```

Explicit foreground long-poll coordinator:

```sh
node roman-reels/scripts/run-telegram-panel.mjs --serve
```

Neither command installs an automatic startup task. On Telegram/Google failure
there is no saved approval fallback. Stop the foreground process to stop polling;
keep the DB for restart/dedup. No queue rows are deleted by these commands.

## Verification

Nine offline panel/transport tests cover trusted delivery, operator/private-chat
checks, frozen tickets, callback replays, approval withdrawal, empty/unavailable
Google, pagination/privacy, truthful waiting states, persistent cursor/restart,
lost responses and bounded/sanitized API failures. Twelve existing queue tests
still pass. Both are registered in the existing offline source CI, with no bot
token or live service credentials. Live Telegram login, polling, coordinator
deployment, full review statuses and video execution remain untested.

## Windows preparation (2026-10-13)

Use the owner's existing unattended laptop as the intended coordinator. Hosting
is no longer an open choice; live configuration and bot deployment are still
separate steps. The owner reported no locally configured protected queue access.
Uploader OAuth is not that access. Do not extract secrets from backups, snapshots,
GitHub or browser storage, and do not reset the Google webhook token.

`setup-windows-telegram.ps1` opens a local form for the owner to enter four fields:
the BotFather token, the owner's numeric Telegram ID, the existing Apps Script
deployment URL and its existing webhook token. The Google values must be supplied
by the owner from the live project's Manage deployments / Project settings →
Script properties (`ROMAN_REELS_WEBHOOK_TOKEN`). They must not be copied from
GitHub or placed in Claude/ChatGPT messages, command arguments or screenshots.
No permission to read or copy those values on the owner's behalf is inferred.

```powershell
powershell.exe -NoProfile -STA -File scripts/setup-windows-telegram.ps1
```

Run from `roman-reels`. Do not weaken execution policy if the script is blocked;
report the blocker. Claude must not inspect or screenshot a populated form.
Secret fields are masked. The form makes no network requests and writes only
DPAPI CurrentUser ciphertext to
`%LOCALAPPDATA%\RomanReels\telegram-panel\config.dpapi`; an existing config is
not overwritten. Closing without saving makes no config. The bot token is pinned
to the public identity `Factory_reels_bot` when getMe is eventually called.

The Node runtime can load this file directly without persisting secrets in
process/user/system environment variables. Same Windows user as setup is needed.

```powershell
node scripts/run-telegram-panel.mjs --windows-check-config
node scripts/run-telegram-panel.mjs --windows-check-access
```

The first command performs local validation only. The second only reads the
protected Google queue; neither calls Telegram, polls, creates the production DB,
changes Google, or activates execution. Output is counts/flags only.
After separate bot deployment approval, `--windows-once` / `--windows-serve`
use this config and a private local SQLite DB. They retain the explicit
`ROMAN_TELEGRAM_DEPLOYMENT_APPROVED=true` gate. No startup task is installed.

Windows test cleanup now closes all SQLite handles in one teardown before
deleting its temporary folder. Old temporary folders reported by the owner are
not deleted by this change. Dedicated Windows CI covers both affected tests,
configuration validation, a real DPAPI roundtrip using fake credentials, and
PowerShell syntax parsing. Real form interaction and owner credentials are not
tested by CI.

## Приём комплекта из четырёх MP4 (кандидат 2026-10-24, не развёрнут)

Первый участок цепочки «основа и три хука → бот → три рилса». Работает внутри того же опроса,
той же SQLite-базы и той же блокировки процесса, отдельного механизма нет (`telegram-intake.mjs`).

1. `/intake <тема>` (латиница, как `--topic-id` запускателя) открывает комплект `tg-YYYYMMDD-xxxxxxxx`.
   У оператора одновременно открыт только один комплект; `/intake` показывает его состояние, `/intake_cancel` отменяет.
2. MP4 присылаются **как файл (документ)**. После каждого файла бот спрашивает роль кнопками
   «Основа / Хук 1 / Хук 2 / Хук 3». Роль никогда не выводится из имени файла. Повторная роль переносится
   на новый файл; повторная доставка того же файла не скачивает его ещё раз.
3. Пока роли не назначены все четыре, бот перечисляет недостающие и кнопки запуска нет.
4. Когда назначены все четыре, бот вызывает существующий `run-local-four-part.py` **только в режиме плана**
   (без `--execute`, без модели и браузера): ffprobe, полное декодирование, SHA-256, четыре разных файла.
   Отказ запускателя пересказывается с ролью вместо пути; ничего не запускается.
5. Сводка: роль, размер, длительность, разрешение, начало SHA-256 и одна кнопка «Подтвердить запуск».
   Подтверждение атомарно переводит комплект в `confirmed` один раз; повторное нажатие или повторная доставка
   отвечает «уже подтверждён». Смена роли после сводки отзывает старую кнопку (номер версии плана в callback);
   перед подтверждением хеши файлов сверяются заново.
6. Сводка строится из плана, сохранённого в базе. Если план сохранён, а отправка сводки сорвалась, повтор той же
   кнопки роли или `/intake` присылает сохранённую сводку с действующей кнопкой — без повторного планирования,
   в том числе после перезапуска и повторного открытия базы.

Папка каждого комплекта — вне Git: `%LOCALAPPDATA%\RomanReels\telegram-intake\<id>\` (`files/<uuid>.mp4`,
`plan-v<n>.json`, `confirmed.json`); в других режимах — абсолютный `ROMAN_TELEGRAM_INTAKE_DIR`, путь внутри
рабочего дерева Git отклоняется. Запускатель вызывается через `%LOCALAPPDATA%\RomanReels\asr-env\Scripts\python.exe`
(там есть jsonschema; системный Python его не имеет) или `ROMAN_INTAKE_PYTHON`.

**Предел Telegram.** Облачный Bot API отдаёт боту через `getFile` файлы не больше **20 МБ**. Бот проверяет
`file_size` до скачивания и отказывает с объяснением; поток дополнительно обрезается на 20 МБ, неполный файл
удаляется. Видео, отправленное как «видео», клиент Telegram может пережать — его бот не принимает и просит
отправить документом. Для сведения: основа HeyGen ROMAN-SEO-01 (26 с, 1080×1920) — 22 МБ, то есть уже больше
предела. Решение владельца 2026-10-24: файлы больше 20 МБ берутся из папки на ноутбуке; собственный Bot API
server не ставится. Для них есть локальный комплект — см. следующий раздел.

`confirmed.json` фиксирует запрос на запуск (тема, пути, хеши, выход запускателя), `executeStarted:false`.
Он выводится только из подтверждённой строки базы и пишется атомарно (временный файл, fsync, переименование).
Существующий файл принимается, только если его содержимое совпадает с ожидаемым; отсутствующий или
повреждённый файл восстанавливается при повторном нажатии кнопки, без второго подтверждения.
Исполнение — ASR, монтаж трёх рилсов, отправка их в Telegram — этим участком не подключено.
Ошибка одного файла или кнопки не останавливает координатор; временная сетевая ошибка скачивания
повторяет весь цикл опроса от сохранённого курсора, как и прежде.

Проверка: `telegram-intake.test.mjs` — 10 офлайн-тестов с поддельным Bot API, вымышленными MP4 из ffmpeg и
настоящим запускателем в режиме плана (полный комплект и одно подтверждение, неполный комплект, отзыв кнопки,
пределы 20 МБ/«видео»/не MP4, повторная доставка и ошибки скачивания, обрезка потока, отказ запускателя,
чужие и групповые чаты, папка вне Git, потерянная сводка после повторного открытия базы,
отсутствующий/обрезанный/изменённый `confirmed.json`). Живой Telegram, бот и токен не использовались.

## Локальный комплект из папки ноутбука (кандидат 2026-10-24, не развёрнут)

Для оригиналов любого размера (до 4 ГБ на файл), включая больше 20 МБ: файлы не скачиваются через Bot API,
а берутся из одной настроенной папки входящих комплектов вне Git. Это тот же приёмщик: те же задания и файлы
в SQLite, тот же вызов запускателя в режиме плана, та же сводка и однократное подтверждение. Второй очереди нет.

Папка входящих: `%LOCALAPPDATA%\RomanReels\telegram-inbox\` (в других режимах — абсолютный
`ROMAN_TELEGRAM_INBOX_DIR`). Она должна быть вне Git и отдельно от папки заданий `telegram-intake`.
Внутри — подпапка на комплект (латиница, цифры, `-`, `_`) с файлом `kit.json`:

```json
{"topicId":"roman-seo-02","parts":{"body":"Основа HeyGen.mp4","h1":"hook-1.mp4","h2":"hook-2.mp4","h3":"hook-3.mp4"}}
```

Соответствие ролям задаётся только этим файлом и никогда не выводится из имён. Имена — простые имена файлов в
папке комплекта (любой алфавит, без разделителей пути, `:` и `..`).

Окно подготовки комплекта (кандидат 2026-10-25): `pythonw roman-reels\scripts\local-kit-window.py` — тема и четыре
MP4 («Основа», «Хук 1–3») → «Подготовить комплект». `local_kit.py` копирует файлы в скрытую временную папку
`.preparing-…` той же папки входящих (бот её не показывает), сверяет SHA-256 копий с исходниками, пишет `kit.json`
с явными ролями (`body.mp4`, `hook-1..3.mp4`) и одним переименованием делает папку `<тема>-<дата>-<время>` видимой.
Имя папки: тема (до 44 символов) + `-ГГГГММДД-ЧЧММСС` и при совпадении суффикс `-2`…`-99` — не длиннее 64 символов,
как требует приёмщик; `topicId` в `kit.json` остаётся полным. Занятое имя пропускается. При ошибке удаляется только
временная папка этой операции; исходники только читаются. План монтажа окно пока не добавляет.

Поддерживается Windows (ноутбук с ботом): там переименование в занятое имя завершается ошибкой. Известное
ограничение POSIX (Linux/macOS): `rename` может заменить пустую папку с тем же именем, созданную в момент между
проверкой и переименованием; гарантии отсутствия перезаписи на POSIX нет.

1. `/intake_local` (без аргументов; любой текст после команды отклоняется — пути из Telegram не принимаются)
   показывает папки комплектов по 10 на страницу, с кнопками «Назад»/«Далее» (в callback только номер
   страницы). Страницы идут по всем папкам, поэтому старые или неверные не скрывают следующие комплекты.
   У готового комплекта — кнопка; в её callback только случайный ID показа, без имён и путей.
   Неполные и неверные комплекты перечисляются с причиной и без кнопок: нет роли, нет файла, один файл на две
   роли, лишняя роль, нет kit.json, недопустимое имя файла.
2. При показе бот считает SHA-256 каждого файла. При выборе комплект читается заново; если любой файл изменился
   после показа, ничего не копируется и нужен новый список.
3. Файлы копируются в `telegram-intake\<id>\files\` без перезаписи; SHA-256 каждой копии сверяется с показанным.
   Исходники в папке входящих не меняются. Затем — тот же план запускателя и сводка.
4. Повторное нажатие той же кнопки возвращает уже созданное задание (или его сводку) и ничего не копирует.
   Тот же комплект с теми же хешами нельзя взять во второе задание, пока первое не отменено.
   Если задание уже сохранено, а сообщение потерялось до проверки, повтор выбора или `/intake` продолжает
   проверку существующих копий (без нового копирования и нового задания); готовый план возвращается сохранённой сводкой.

Выход за пределы входящей папки отклоняется: подпапки берутся только прямо из неё; ссылки и junction-каталоги,
а также файлы, чей настоящий путь ведёт из папки комплекта, не принимаются.

Проверка: `telegram-local-kit.test.mjs` — 6 офлайн-тестов: полный комплект с вымышленной основой больше 20 МБ
(копии, SHA-256, план по копиям, повтор выбора, однократное подтверждение, запрет второго задания), неполные
и неверные комплекты, изменение исходника после показа, недопустимые пути (`..`, абсолютный, вложенный, `\`,
аргумент команды, неизвестный ID, junction вне папки), потерянное сообщение до плана с повторным открытием
базы (одно задание, четыре копии, план один раз), выбор одиннадцатого комплекта на второй странице. Живой Telegram, бот и токен не использовались.

## Исполнитель подтверждённых комплектов (кандидат 2026-10-24, не развёрнут)

Монтаж запускается только явной кнопкой для каждого подтверждённого комплекта. Подтверждения, сделанные раньше
(например, `tg-20261024-07f1fd1a`), сами в очередь не попадают: их показывает `/montage` с кнопкой
«Запустить монтаж». Это та же SQLite-база и те же задания приёма; добавлены только таблицы `intake_runs`
(запуски) и `intake_deliveries` (отправки). Отдельной системы заданий нет.

1. Кнопка «Запустить монтаж» (`ix:<задание>`) атомарно ставит один запуск в очередь: статус **ожидает**.
   Повторное нажатие запуск не дублирует. Бот лишь стартует отсоединённый процесс
   `run-intake-executor.mjs --windows` и сразу отвечает: опрос Telegram не ждёт ASR и рендера.
2. Исполнитель держит блокировку — строку `intake_executor_lock` в той же базе: один монтаж на ноутбуке; в базе может быть только
   одна строка в статусе **обрабатывается**. Задания берутся по одному, по порядку.
3. Перед запуском заново сверяются SHA-256 четырёх копий с подтверждённым планом и `confirmed.json`.
4. Затем вызывается существующий `run-local-four-part.py --execute` (он сам фиксирует concurrency 1 и видеокэш
   268435456; исполнитель проверяет эти значения в `launch-report.json` и SHA-256 каждого рендера).
   Модель — `asr-models\faster-whisper-small` с ревизией из `revision.txt`, браузер — Edge, Python — `asr-env`.
5. Статусы: ожидает → обрабатывается → **готово** или **ошибка**. В папке задания `executor\`: `steps.json`,
   журналы запускателя, `result.json` или `error.json`; выход запускателя — в `run-<задание>\`.
6. Дерево процессов задания: исполнитель записывает корень запускателя и FFmpeg, а затем каждые 3 с их потомков
   (Python-шаги, Node/Remotion, браузер, FFmpeg) — по PID и времени создания (повторно выданный PID не путается с
   прежним) — в базу и `executor\processes.json`. Процессом задания считается также любой процесс, в командной
   строке которого есть ID задания (его пути). Сирота завершившегося записанного родителя (Windows не меняет PID
   родителя) относится к заданию, только если создана не позже последнего снимка, где этот родитель ещё держал свой
   PID; созданная позже (PID мог быть выдан другому процессу) — неподтверждённая. Одного совпадения PID недостаточно;
   время создания сравнивается с полной точностью Windows (100 нс), без округления до миллисекунд. Приблизительное
   время запуска и пустое время создания не подтверждают идентичность: такой процесс — «состояние неизвестно».
   Корень (запускатель, FFmpeg) опознаётся только пока он не завершился (Node держит его дескриптор, PID не может
   принадлежать другому процессу).
   Исполнитель в первой версии **не завершает процессы монтажа и посторонние процессы** (нет `taskkill` и
   завершения по PID). Ограничен по времени только собственный служебный запрос списка процессов (PowerShell
   `Get-CimInstance`, таймаут `execFile` 60 с). По таймауту
   (запускатель 4 ч, копия просмотра FFmpeg 30 мин) он перестаёт ждать в срок, не дожидаясь события закрытия:
   запуск — ошибка, результат не отправляется как готовый, бот сообщает причину и что нужна ручная проверка
   процессов на ноутбуке. После нормального завершения шага исполнитель ограниченно ждёт исчезновения процессов
   задания; оставшиеся или неопознанные — тоже ошибка с ручной проверкой.
   **Ограничение первой версии:** отсоединённый потомок, чей промежуточный родитель запустился и завершился между
   двумя снимками (3 с), без ID задания в командной строке, не связывается с заданием и может быть пропущен.
   Запускатель ради маркировки потомков не расширяется.
7. После таймаута, аварии (прерванный «обрабатывается») или неопределённого состояния (процесс не опознан, список
   процессов недоступен, блокировку держит неопознанный процесс) очередь получает **устойчивую остановку** — одну
   строку `intake_executor_hold`. Бот сообщает причину один раз — оператору задания, ожидающих и выполняемых
   заданий (или последнего запуска, если других нет) — с кнопкой «Проверено, продолжить очередь»; та же причина и
   кнопка видны в `/montage` и в ответе на «Запустить монтаж». Исчезновение видимых процессов остановку не снимает;
   снимает только подтверждение ручной проверки оператором (устаревшая кнопка ничего не делает). После него
   неопознанные записи прежних запусков больше не держат очередь, а видимые живые процессы — держат и дают новую
   остановку. Следующий монтаж и повтор автоматически не запускаются. Блокировка хранит PID, время
   создания и токен исполнителя. Владелец проверяется по списку процессов, снятому уже после чтения блокировки;
   устаревшая заменяется только сравнением с обменом по её токену — из двух одновременно восстанавливающих один
   выигрывает, проигравший не трогает чужую блокировку, не объявляет чужое задание прерванным и ничего не берёт.
   Снимает блокировку только владелец (по своему токену). Восстановление проверяется по списку, снятому после захвата.
8. После ошибки или смерти самого исполнителя повтор автоматически не запускается. Зависший «обрабатывается»
   проверяется при следующем старте исполнителя — его инициирует и `/montage`, даже если ожидающих заданий и
   отправок нет. Пока прежний исполнитель или процессы задания живы, задание не объявляется прерванным; когда все
   исчезли — помечается ошибкой с указанием шага, папка `executor\` повторно не используется.
9. Готовые оригиналы остаются на ноутбуке. В Telegram уходит документ (без пережатия), если файл не больше
   50 МБ — предел `sendDocument` облачного Bot API. Крупнее — отдельная копия просмотра шириной 720 px со звуком
   без перекодирования (`executor\h<n>-preview-720.mp4`); если и она больше 50 МБ — итоговое сообщение с причиной и
   путями оригиналов (и тогда, когда не отправлено ни одного файла); причина и папка видны и в `/montage`.
10. Отправка повторяется кнопкой «Повторить отправку» в `/montage`: заново уходят только неотправленные рилсы,
   монтаж не повторяется. Telegram не гарантирует доставку ровно один раз: после потерянного ответа рилс может
   прийти дважды, повторного монтажа при этом нет.

`/montage` показывает последние запуски со статусами и подтверждённые комплекты без запуска.

Проверка: `telegram-executor.test.mjs` — 25 офлайн-тестов на заглушках запускателя, ffmpeg и Telegram
(явная кнопка и одна очередь, ранее подтверждённое задание не запускается само, проверка хешей до запуска,
ошибка запускателя с журналами и без повтора, прерванный запуск и занятая блокировка, рендер больше 50 МБ с копией
просмотра, повтор отправки без повторного монтажа, отказ `sendDocument` больше 50 МБ, настоящие раннеры процесса и
ffmpeg на вымышленном видео, два конкурирующих исполнителя с устаревшим снимком процессов, снятие блокировки только
владельцем, отсутствующий Python без EBADF, смерть исполнителя при живых процессах задания — по метке и по
записанному PID, сироты завершившегося родителя с учётом времени создания и повторной выдачи PID, времена внутри
одной миллисекунды, недоступный список процессов, все рилсы больше 50 МБ; в исполнителе нет команд завершения
процессов; таймаут возвращается в срок без события закрытия и ничего не завершает; таймаут запускателя и копии
просмотра — без доставки, с сообщением о ручной проверке и блокировкой очереди; процессы после нормального выхода
запускателя ограниченно ожидаются и блокируют; приблизительное или пустое время создания не подтверждает
идентичность; устойчивая остановка после аварии, таймаута и неопределённого состояния, одно уведомление без
ожидающих заданий, устаревшее подтверждение, запрос монтажа во время остановки). Вместо Python/Remotion/браузера — безвредные процессы Node.
Настоящие ASR, рендер и отправка не запускались.
