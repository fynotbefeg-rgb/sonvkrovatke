# Передача проекта на неделю без Codex

Составлено 2026-10-13 локальным Claude на ноутбуке владельца. Основа: `feature/codex-pipeline` @ `31aaa47`.
`main` не меняется. Каждый законченный этап — отдельная ветка и PR в `feature/codex-pipeline`; PR сливает
только владелец.

## Актуальный итог локального отчёта на 2026-10-13

Источник живых наблюдений — отчёт Claude на ноутбуке, переданный владельцем; Codex не управлял этими
процессами и не выполнял повторный живой прогон. Технический обмен вымышленным пакетом завершён:
received/acknowledged → повтор без дублей → проверенное empty, квитанция сохранена. Испытания A/B/C
завершены по разрешениям владельца; задача RomanReels-Runtime зарегистрирована, последний PID **7804**.
После перезагрузки Windows работа не проверена; нужен вход пользователя. Google review выключен,
темы Романом не просмотрены и не утверждены. Снимки и старые планы ниже — история, не новые задания.
Не повторять выполненные A/B/C и обмен, не останавливать бот без нового разрешения.

## Неизменные правила

- Роман ещё **не** просмотрел и не утвердил темы. Старые отметки и тестовые пакеты не являются согласованием.
- HeyGen, платные вызовы, генерация аватара, монтаж, рендер и производство не запускаются.
- Секреты не извлекаются из GitHub, резервных копий, браузера или снимков; токены не выводятся.
- Google (Apps Script, флаги, строки, утверждения, триггеры) меняется только по отдельному разрешению.
- Отказ в разрешении не обходится — сообщается причина.

## Исходный снимок до обмена и испытаний (исторический)

| Компонент | Состояние |
|---|---|
| Основной клон | `feature/codex-pipeline` @ `31aaa47`, только fast-forward; неотслеживаемая `roman-reels/pv/.playwright-mcp/` не тронута |
| Apps Script | тот же deployment, **Version 6**; Code.gs `01723065…` не менялся, RomanApproval.gs `fd4ac449…`, SharedReview.gs `a57b6567…`; резервная копия V5 в `%LOCALAPPDATA%\RomanReels\apps-script-backup\20261013-082552-v5` |
| Подробные статусы | endpoint отвечает: `enabled=false`, тем 0, `approvalWrites/productionAllowed=false`; очередь утверждений — 0 |
| Telegram-бот | `@Factory_reels_bot`, PID **23064**, `--windows-serve` из основного клона, `run-windows-supervisor --status` → `running`; DPAPI-конфиг, SQLite, курсор на месте; автозапуска нет |
| Каталог «Кандидаты тем» | установлен из `telegram-candidates-20261013.json` (SHA-256 `83976b33…0262`), тем 2 |
| Загрузчик Drive | OAuth владельца (DPAPI), запись в incoming работает |
| Тест квитанции (PR25) | `windows-receipt-test-20261012/v1`: 4 MP4 + `recording-set.json`, повтор `already_uploaded` |
| Почтовый ящик заданий | `_windows-jobs/source-plan-v1.json` пуст (`status=empty`); `delivery-config.json` вне Git |
| Слот подтверждений | `_windows-jobs/source-plan-ack-v1.json` создан, `{"ackVersion":"1.0.0","status":"empty"}`, права: владелец + один читатель, без публичного доступа; `delivery-ack-config.json` вне Git; `ack-windows-plan.mjs` → `waiting` |

## Этап 2 ВЫПОЛНЕН — технический обмен вымышленным пакетом (2026-10-13, 12:52–13:05 UTC)

- Первый `inspect` отказал без причины; PR №41 (`70fac38`, слит владельцем) добавил безопасную причину отказа.
  Причина: в значениях трёх repository variables был перевод строки в конце; владелец исправил их.
- `inspect` → зелёный (`empty`); `publish_fixture` → зелёный.
- Ноутбук (наблюдатель только читал ящик): 12:58:18 обнаружен фиксированный пакет `transport-test`
  (contentSha256 `cc14ec9f…`); первый проход `ack-windows-plan.mjs` → `received` + `acknowledged`, повтор
  новым процессом → `already_received` + `already_acknowledged`; один хеш подтверждения в обоих проходах и в
  слоте Drive, подтверждение привязано к точному конверту; 1 локальное подтверждение, 1 каталог пакета,
  0 `.partial`; все флаги генерации/загрузки/рендера false. Отчёт: `%LOCALAPPDATA%\RomanReels\delivery-probe\`.
- Облако: повторный `publish_fixture` → `acknowledged: true`, `already_acknowledged` (без записи).
- `clear_acknowledged_fixture` → затем `inspect` (владелец). Независимая проверка на ноутбуке: ящик ровно
  пустой JSON, слот подтверждения хранит запись `transport-test` с false-флагами, локальные пакет и
  подтверждение сохранены, `receive-windows-plan.mjs` → `waiting`. Бот PID 23064 не трогался.

## Разрешение A выполнено — живой тест супервизора (2026-10-13, по разрешению владельца)

- Основной клон: fast-forward до `7ba6345` (PR №41). Бот 23064 сверен по командной строке, `serve.pid` и lock,
  остановлен только он; `--status` → `stale_lock` (PID 23064).
- Один проход `ensure-roman-runtime.ps1 -BotDeploymentApproved -Receive`: `action=started`, новый PID **4968**,
  `clearedStaleLock=true`, `confirmation=confirmed`, приёмщик `ok/waiting`, stderr пуст.
- После завершения прохода поллер жив: `--status` → `running` 4968, один поллер, lock и `serve.pid` его;
  события `telegram_identity_verified` и `telegram_poll_completed`, ошибок и `retry_wait` нет.
- Повторный проход: `action=none` (второй поллер не запускается), приёмщик `waiting`.
- Флаг `ROMAN_TELEGRAM_DEPLOYMENT_APPROVED` не сохранён в пользователе/системе; DPAPI-конфиг, SQLite, курсор
  не менялись. Задача планировщика **не** зарегистрирована (это разрешение B).

## Разрешение B выполнено — задача планировщика (2026-10-13 16:18 местного времени)

- `RomanReels-Runtime`: при входе пользователя и каждые 5 минут (бессрочно), `Interactive` (только при входе),
  `Limited`, `IgnoreNew`, лимит 15 мин; действие —
  `ensure-roman-runtime.ps1 -BotDeploymentApproved -Receive` из основного клона, скрытое окно.
- Ручной запуск задачи: результат 0, `action=none` (бот 4968 остаётся единственным поллером), приёмщик `waiting`.
- Откат: `Unregister-ScheduledTask -TaskName 'RomanReels-Runtime' -Confirm:$false`.
- Разрешение C выполнено: бот 4968 сверен и остановлен в 16:20:11; плановый запуск задачи в 16:23:23 сам поднял
  поллер **PID 7804** (`clearedStaleLock=true`, `confirmation=confirmed`, `restartsLastHour=2`), задача завершилась
  с результатом 0, поллер жив через 60 с после завершения задачи, один поллер, 4 опроса, 0 ошибок.
- Не проверено: поведение после перезагрузки Windows (нужен вход пользователя).
- Продолжение работы в новой сессии: команда «Роман рилсы» или `/roman-reels` (навык пользователя на ноутбуке),
  `CLAUDE.md` — ветка `feature/session-continuity-20261013`.

## Историческая подготовка после слияния PR №37–40 (до завершения обмена и A/B/C)

- Основной клон: fast-forward до `d6c0dfa` (PR №40), бот PID 23064 не перезапускался.
- Этап 2 подготовлен: `delivery-config.json` / `delivery-ack-config.json` сверены с Drive (3 разных ID, ящик и
  слот `empty`); права ровно по `WINDOWS_DELIVERY_PROBE.md` — сервисный аккаунт: запись в ящик, чтение папки и
  слота; публичного доступа нет. **Блокер:** в этой среде нет GitHub API (`gh`/MCP), токен git не извлекается —
  владелец сам создаёт три repository variables и запускает `inspect` → `publish_fixture` в интерфейсе GitHub.
  На ноутбуке работает наблюдатель (только чтение ящика раз в 30 с), который при появлении именно
  фиксированного вымышленного пакета выполняет два прохода `ack-windows-plan.mjs` и пишет отчёт в
  `%LOCALAPPDATA%\RomanReels\delivery-probe\`. Затем владелец: `inspect` (acknowledged=true) →
  `clear_acknowledged_fixture` → `inspect` (empty).
- Новые ветки (PR не созданы — нет инструментов GitHub):

| Этап | Ветка | Коммит | Тесты |
|---|---|---|---|
| Канал outbox → облачный издатель | `feature/windows-outbox-channel-20261013` | `cca194c` | 7/7 офлайн |
| Ограниченный адаптер Gemini + аудит | `feature/gemini-bounded-adapter-20261013` | `6ff23aa` | 5/5 офлайн, 0 запросов к API |
| Испытания восстановления + обновлённая установка супервизора | `feature/windows-recovery-drills-20261013` | `d46615b` | 4/4 офлайн-сценария |

Испытания и инструкция (задачи 3–4 списка ниже) подготовлены; живая часть разбита на разрешения A/B/C в
`WINDOWS_RUNTIME_SUPERVISOR.md` и не выполнялась. Наблюдатель этапа 2 перезапущен фоновой задачей на 2 часа.

- Следующие задачи по порядку: (1) завершить этап 2 после действий владельца; (2) CLI `push-windows-outbox.mjs`
  и Python-обвязка релея (нужен Python для проверки — в CI); (3) испытания восстановления после сбоев на
  вымышленных данных (обрыв сети, kill поллера, устаревший lock, повреждённый журнал) — только офлайн, без
  остановки живого бота; (4) обновлённая инструкция установки супервизора с отдельным запросом разрешения на
  живой тест и регистрацию задачи.

## Исторический список PR №37–40 (уже слиты владельцем)

Codex создал PR и независимо проверил код. Живые настройки не менялись.

| Этап | Ветка | PR |
|---|---|---|
| Этот документ | `feature/windows-week-handoff-20261013` | https://github.com/fynotbefeg-rgb/sonvkrovatke/pull/37 |
| Устойчивый запуск | `feature/windows-runtime-supervisor-20261013` | https://github.com/fynotbefeg-rgb/sonvkrovatke/pull/38 |
| Очередь → подготовка пакета | `feature/windows-queue-delivery-bridge-20261013` | https://github.com/fynotbefeg-rgb/sonvkrovatke/pull/39 |
| Ручной облачный тестовый обмен | `feature/codex-windows-delivery-probe` | https://github.com/fynotbefeg-rgb/sonvkrovatke/pull/40 |

Предполагаемый конфликт строк CI устранён: обе проверки остаются в workflow, пробные слияния чистые.
В мост добавлен тест подмены корректного конверта под ожидаемым именем: повтор сверяет deliveryId.
Автономные проверки Codex: супервизор 9/9, мост 7/7, облачный probe 8/8, Python-издатель 12/12.
Перед слиянием проверять CI и точный head каждого PR; после слияния обновлять Windows только fast-forward.

Старые ветки `feature/windows-plan-ack-20261013` и `feature/windows-review-status-clock-skew-20261013` уже
вошли в `feature/codex-pipeline` (PR №32–36).

## Прежний план этапов — выполненные шаги сверять с актуальным итогом сверху

### 1. Настройка подтверждений получения — ВЫПОЛНЕНО
Критерий: слот создан и проверен, конфиг сохранён, пустой ящик → `waiting` без записи. Выполнено (см. таблицу).

### 2. Один вымышленный пакет: передача, подтверждение, повтор без дублей — КАНДИДАТ В PR40
Ручной режим `windows_delivery_probe` подготовлен в существующем зарегистрированном
`roman-reels-check.yml`. Значение по умолчанию false; выбранный режим отключает все остальные jobs.
Он принимает только фиксированный вымышленный пакет, не произвольные тексты/outbox. Ни workflow,
ни реальные записи/чтения этим новым режимом ещё не запускались.

После разрешения владельца и слияния PR40:
1. Приватно настроить три закреплённых ID из проверенных локальных configs как repository variables
   `ROMAN_WINDOWS_DELIVERY_FILE_ID`, `ROMAN_WINDOWS_DELIVERY_FOLDER_ID`, `ROMAN_WINDOWS_DELIVERY_ACK_FILE_ID`.
   Существующий `GDRIVE_SA_JSON` остаётся в Actions. Не копировать секреты или configs в Git/логи.
2. Следовать `WINDOWS_DELIVERY_PROBE.md`: inspect → publish_fixture → один запуск ack на Windows
   в течение 15 минут → повтор новым процессом → inspect (acknowledged=true).
3. Только после точного подтверждения выполнить clear_acknowledged_fixture тем же облачным писателем.
   Ящик станет empty; подтверждение и локальные файлы остаются. Не удалять их автоматически.

Критерий: received/acknowledged, затем already_received/already_acknowledged, одна локальная запись;
облачная проверка exact receipt и проверенное возвращение ящика в empty. Все разрешения исполнения false.
При чужом/реальном пакете, повреждении, отказе доступа или неоднозначной записи — остановиться и прочитать
состояние, не выполнять слепой повтор записи. За пределами разрешения владельца живой тест не запускать.

### 3. Устойчивый запуск бота и приёмщика — КОД ГОТОВ (ветка выше)
Сделано: `run-windows-supervisor.mjs`, `windows-runtime-supervisor.mjs`, `windows/ensure-roman-runtime.ps1`,
`WINDOWS_RUNTIME_SUPERVISOR.md`, 9 тестов; живой `--status` → `running`. Задача планировщика не создавалась.
Осталось (после разрешения владельца): один ограниченный живой тест — остановить бот, выполнить один проход
`ensure-roman-runtime.ps1 -BotDeploymentApproved -Receive`, проверить новый PID и события; затем, по отдельному
разрешению, зарегистрировать задачу по инструкции.
Критерий: после остановки или перезагрузки (с входом пользователя) в течение 5 минут ровно один поллер,
события `telegram_identity_verified` и `telegram_poll_completed`; при трёх сбоях за час — `crash_loop`.

### 4. Очередь бота → передача ноутбуку — КОД ГОТОВ (ветка выше)
Сделано: `queue-delivery-bridge.mjs`, `QUEUE_DELIVERY_BRIDGE.md`, 6 тестов. База бота открывается только для
чтения, согласования перечитываются, конверт пишется в outbox без дублей, неподтверждённый предыдущий пакет
блокирует следующий.
Осталось: решить транспорт outbox → почтовый ящик (см. QUEUE_DELIVERY_BRIDGE.md); PR40 передаёт только вымышленный пакет и этот канал не реализует и источник пакета
`shared-review`; живых данных нет, пока Роман не выбрал и не утвердил тему.

### 5. Независимые задачи, если всё выше ждёт решения
- Зафиксировать причину остановки бота 13.10 в 08:48 (прежний код скрывал её; новый пишет `telegram_stopped`).
  Проверять `serve-stdout*.log` на `telegram_retry_wait` / `telegram_stopped` раз в день, отчёт без секретов.
- Очистка временных папок тестов SQLite в `%TEMP%` (`roman-queue-*`, `telegram-panel-*`) — только с разрешения.
- В Блокноте на ноутбуке был открыт `client_secret_…json` OAuth-клиента; убедиться, что он закрыт и не лежит в
  общедоступной папке (решение владельца).
- Остаток PixelSee: `C:\Users\Антон\PixelSee\Luminati-m` (4 файла, процессов и автозапуска нет) — удалить вручную.

## Как проверить состояние за минуту

```powershell
cd C:\Users\Антон\work\sonvkrovatke\roman-reels
git log --oneline -1
node scripts/run-telegram-panel.mjs --windows-check-access
node scripts/receive-windows-plan.mjs
```
и (после слияния этапа 3) `node scripts/run-windows-supervisor.mjs --status`.
Ожидается: `authenticatedRead=true`, `waiting`, `running`; все флаги генерации и рендера false.

## 2026-10-13 — CLI outbox и облачная обвязка релея (CLAUDE_NEXT_AUTOMATION_TASK, задача 1)

Ветка `feature/windows-outbox-relay-20261013`: `push-windows-outbox.mjs`, `relay-windows-outbox.mjs`, `relay_windows_outbox.py`,
режим `windows_outbox_relay` в `roman-reels-check.yml`. Node 6/6 локально; Python 9 тестов — только в CI (Python на
ноутбуке нет). Живой запуск не выполнялся: нужны слот outbox, переменная `ROMAN_WINDOWS_OUTBOX_FILE_ID` и утверждённая
Романом тема. Gemini-адаптер уже подключён в PR52; его живой запуск остаётся отдельно заблокированным.
## 2026-10-13 — Gemini подключён к редакторскому CLI (CLAUDE_NEXT_AUTOMATION_TASK, задача 2)

Ветка `feature/gemini-editorial-cli-20261013`: `run-researched-gemini.mjs` использует `createGeminiClient`, требует
инициализированное долговременное хранилище журнала вне Git, в Actions generate заблокирован до выбора постоянного
хранилища. Новые тесты 4/4 локально и в обоих CI jobs. Настоящих запросов нет. Решение владельца: где хранить общий журнал
(ноутбук или закреплённый файл Drive с одним писателем).


## 2026-10-14 — единый кандидат исправления подтверждений

PR55 теперь охватывает тему, основу и каждый хук через execute-as-user Google-вход. view=topics — тема; view=review — основа с окончаниями, затем три независимых хука. 26/26 self tests, 25/25 shared, 24/24 topic-only; без живой установки/согласований. После зелёного CI нужно отдельное разрешение на слияние/установку. Не переносить решение темы на тексты. Роман уже принял содержание в переписке; остаётся техническое оформление точного пакета и проверка реального Google-входа.


## 2026-10-15 — Windows Gemini private pilot candidate

Prepared owner-only masked WinForms API-key entry, DPAPI CurrentUser storage outside Git, canonical persistent budget initialization/checks and Windows editorial wrapper. Owner reports Default Gemini Project Free tier; neither billing nor key inspected by Codex. Modes separate offline preparation, model catalogue/countTokens access check and explicitly double-gated one-shot generation. 9 offline tests plus Windows-only fictional DPAPI roundtrip; Linux/Windows CI entries and PowerShell syntax check. WINDOWS_GEMINI_PILOT.md contains installation task. No live API requests, Windows setup, secrets, Google/Drive/bot/scheduler, HeyGen or production changes. No automatic regeneration of Roman-approved texts. Next: green CI, owner-authorized merge, then owner enters key only in local form; report access before authorizing one fictional generation.


## 2026-10-15 — exact topic read-only cloud probe and pending speech packet

Prepared isolated topic_review_probe in existing registered check workflow; allowed only base and the explicit probe branch, all other jobs suppressed. Uses existing credentials inside Actions, exports only topic ID/revision/status and false approvalWrites/production flags, no identities or tokens. Four offline tests. Prepared exact three-hook/current plugin body pending manifest and shared packet (revision2), no invented approvals/endings. Existing editorial release remains required: incomplete GSC/OpenSEO demo, unverified reference metrics and original free-workflow gate still block publication; owner-approved overview angle is recorded, not silently substituted for proof. No Google registration or production performed.


## 2026-10-15 — scoped disclosed SEO pricing policy
Prepared version 1.3.0: only exact accepted topic/revision/three speech hashes
may use seo_disclosed_costs_v1. All five cost layers, official fresh pricing,
paid amount/currency/billing basis/minimum commitment and explicit disclosure
remain mandatory. Other topics remain free-only; demo/reference/semantic gates
unchanged. See SEO_RELEASE_STATUS.md. No Google writes, payments, generation,
HeyGen or production. PR57 receipt probe verified the topic; speech stays pending.


## 2026-10-15 — GSC bounded read adapter, not a live MCP connection
Audited upstream mcp-gsc at d49eea9. Prepared separate Node adapter with three
read-only operations, fixed page/date/10-row query, returned-property binding,
no redirects/retries, per-session reservation and bounded response. Seven offline
tests include denied write-tools and broad/expired provider metadata. Auth scope
metadata is a provider contract, not independent OAuth proof. No credentials,
login, MCP transport or live data yet. See GSC_READONLY_CONNECTION.md for precise
remaining OAuth/Windows storage/MCP steps. No installation or live changes.


## 2026-10-16 — подготовка последовательного слияния PR57–59

Проверены прежние точные head и зелёный CI; независимое ревью Luna не нашло
блокирующих замечаний. В изолированной ветке сохранены обе стороны конфликтов
handoff и все новые тесты Linux/Windows. PR58 включает изменения PR57; PR59
включает PR57/58. CI нужно подтвердить на обновлённых head. Base не изменена.

**Следующий шаг после разрешённого слияния — диагностика ноутбука и оставшиеся
фактические проверки, не автоматическая регистрация Google-пакета.** Тема
выбрана; точные основы/хуки pending. Демонстрация GSC/OpenSEO, текущий reference
и semantic release остаются незавершёнными; новый режим стоимости их не отменяет.
Материалы GEO/карточки подготовлены в облаке, на ноутбук не передавались.
Ни Google, ни бот, ни секреты, ни HeyGen/генерация/монтаж не затронуты.


## 2026-10-16 — разрешённое владельцем обновление кода

Владелец отдельно разрешил Codex последовательное слияние PR57 → PR58 → PR59.
PR57 слит: 0db814735b6722e79af076817bfbac613875cff1.
PR58 слит: 04f16b9eea0e102c288155aa77386424b1ca9fb5.
Перед слиянием CI был зелёным на точных head, prospective merge tree PR58
совпал с проверенным деревом. Эта завершающая запись включена в PR59; его
фактический статус и merge SHA — https://github.com/fynotbefeg-rgb/sonvkrovatke/pull/59 .
Последняя правка относится только к передаче состояния, код проверок не менялся.

**Claude на ноутбуке:** проверить чистоту рабочего дерева; обновить основную
ветку только fetch + merge --ff-only. Локальные данные и .playwright-mcp не трогать.
Затем только диагностика текущего супервизора/бота и MCP без перезапуска процессов
и без второго бота. Следующий шаг первого пилота — закрыть недостающие факты и
доступы, не автоматическая отправка pending-пакета в Google.

Тема SEO уже выбрана: Codex подтвердил точную ревизию 2 защищённым чтением.
Принятую основу/хуки не переписывать. Пакет пока не зарегистрирован для отдельных
серверных квитанций; GSC/OpenSEO demo и редакторский допуск не завершены.
Никакого разрешения на HeyGen, платные вызовы, монтаж или производство слияния
не дают. Google, токены, конфиги, база, процессы и автозапуск не менялись.

## 2026-10-16 — GSC: read-only OAuth выполнен нашим адаптером (не проверенный GSC MCP)

Факты на 16.10: в Google Cloud проекта montazh включён Search Console API; создан Desktop-клиент
roman-reels-gsc-readonly (секрет только в локальной закрытой папке вне Git). Владелец нажал Allow 16.10;
scope только webmasters.readonly, предупреждения о непроверенном приложении не было. Токен сохранён через
DPAPI (CurrentUser) в %LOCALAPPDATA%\RomanReels\gsc вне Git. sites.list вернул уровень siteFullUser для
https://idco.ru/. get_recent_queries выполнен 16.10 за период 16.09–13.10 (28 дней, окончание за 3 дня до
запроса, не более 5 строк по сайту); результат лежит вне Git, в репозиторий и в этот файл не включён.

Что это и чем не является: это наш собственный адаптер scripts/gsc-readonly-client.mjs и PKCE-вход
scripts/gsc-oauth-loopback.mjs, а не проверенное подключение GSC MCP; MCP-сервер Search Console не
подключался и не проверялся. Адаптер допускает только ресурс https://idco.ru/ и отвергает sc-domain:idco.ru
и чужие адреса. Адрес из login_hint (подсказка при входе в Google) не доказывает личность аккаунта и не
считается подтверждением владельца: доказательством доступа служит ответ sites.list, а не подсказка.
Права на сайт: siteFullUser, не владелец.

Правки по ревью Codex: (1) хранилище токена требует заданный абсолютный LOCALAPPDATA и расположение вне
Git work tree; путь проверяется до создания папок и записи файлов; (2) в OAuth callback сначала
проверяется state: запрос с чужим или отсутствующим state, в том числе с error или code, не завершает
ожидание; только запрос с нашим state может отклонить вход или передать code. Добавлены офлайн-тесты на оба
исправления (без живого OAuth, чтения токена и API-запросов).

Не сделано: запись о проверенном GSC MCP, коммит/PR этой ветки. Платных запросов, HeyGen, регистрации
пакета, изменений таблицы, согласований, сайта и производства не было.

## 2026-10-24 — бот: приём комплекта из четырёх MP4 (ветка feature/telegram-four-part-intake-20261024)

Кандидат первого участка «основа + три хука → бот → три рилса»; описание в TELEGRAM_PANEL.md,
раздел «Приём комплекта из четырёх MP4». `/intake <тема>` → MP4 документом → роли кнопками →
`run-local-four-part.py` в режиме плана → сводка → одна кнопка подтверждения (повтор не создаёт второго
запуска). Та же база, опрос и блокировка; папки комплектов в `%LOCALAPPDATA%\RomanReels\telegram-intake`.
Предел облачного Bot API — 20 МБ на файл; основа ROMAN-SEO-01 (22 МБ) в него не проходит. Решение
владельца: файлы больше 20 МБ — из папки ноутбука, без своего Bot API server; это следующее отдельное
изменение. Подтверждение пока только фиксирует комплект; ASR, монтаж и возврат рилсов не подключены.
Draft PR №69. По ревью Codex: потерянная сводка восстанавливается из сохранённого плана без повторного
планирования; confirmed.json пишется атомарно, проверяется по содержимому и восстанавливается из базы.
Проверено офлайн (10 тестов приёма, прежние тесты панели/очереди/опроса проходят). Работающий бот (PID 7888, основной клон) не перезапускался и нового кода не видит;
развёртывание — только после слияния и отдельного разрешения на перезапуск.

## 2026-10-24 — бот: локальный комплект из папки ноутбука (ветка feature/telegram-local-kit-intake-20261024)

PR №69 слит (b188d80). Решение владельца: оригиналы больше 20 МБ берутся из папки ноутбука, свой Bot API
server не ставится; по HeyGen Claude не кликает и ничего не скачивает (условия HeyGen от 15.10.2026, раздел 2;
цитата во внешнем локальном handoff). Кандидат: `/intake_local` → кнопки готовых комплектов из
`%LOCALAPPDATA%\RomanReels\telegram-inbox\<комплект>\kit.json` → копии в папку задания со сверкой SHA-256 →
тот же план запускателя, сводка и одно подтверждение. Описание — TELEGRAM_PANEL.md, раздел «Локальный
комплект из папки ноутбука». Список постраничный; потерянное сообщение до плана продолжается по
существующим копиям. 6 новых офлайн-тестов, прежние проходят. Бот и RomanReels-Runtime не менялись.

## 2026-10-24 — исполнитель подтверждённых комплектов (ветка feature/telegram-intake-executor-20261024)

PR №70 слит (1d95f8a), бот перезапущен штатно (PID 9556), первый живой комплект подтверждён:
`tg-20261024-07f1fd1a` (новая основа + три прежних хука). Кандидат: кнопка «Запустить монтаж» и `/montage` →
отсоединённый `run-intake-executor.mjs` → проверка хешей → `run-local-four-part.py --execute` → статусы
ожидает/обрабатывается/готово/ошибка → документы до 50 МБ или копии просмотра. Без автоматических повторов;
повтор отправки не повторяет монтаж; дерево процессов задания учитывается и завершается, следующий монтаж и
объявление прерванным ждут его исчезновения. Описание — TELEGRAM_PANEL.md, «Исполнитель подтверждённых комплектов».
Блокировка исполнителя — строка в базе с заменой устаревшей по токену. По ревью Codex CLI: сироты завершившегося
родителя, полная точность времени создания, итог при всех рилсах больше 50 МБ. Первая версия не завершает процессы:
по таймауту запуск — ошибка без доставки, очередь блокируется до исчезновения процессов или подтверждения их
состояния, бот просит ручную проверку. После таймаута, аварии или неопределённого состояния — устойчивая
остановка очереди до подтверждения ручной проверки оператором (кнопка в сообщении и `/montage`). Ограничение:
отсоединённый потомок промежуточного процесса между снимками может быть пропущен. 25 офлайн-тестов. Ранее подтверждённое задание само не запускается; первый реальный монтаж — по отдельному разрешению.

## 2026-10-25 — план монтажа в задании и окно подготовки комплекта

PR №72 (план монтажа) слит в feature/codex-pipeline (106d898), бот перезапущен штатно. Живое задание
tg-20261025-57be40c9 собрано по плану c4b9c238…: три technical_qc пройдены, доставлено 3 из 3, визуальная проверка
трёх вариантов без блокирующих проблем; согласование Романа и готовность к публикации не отмечены.

Ветка feature/local-kit-window-20261025: окно `roman-reels/scripts/local-kit-window.py` (tkinter из стандартной
библиотеки) и `local_kit.py` готовят обычный комплект для `/intake_local` — тема и четыре MP4 → скрытая временная
папка `.preparing-…` во входящей → копии со сверкой SHA-256 → `kit.json` с явными ролями → одно переименование в
`<тема>-<дата>-<время>`. При ошибке удаляется только своя временная папка; исходники только читаются; плана монтажа
в окне нет. Поддерживается Windows; на POSIX известное ограничение переименования (TELEGRAM_PANEL.md).
11 Python-тестов и Node-тест приёма комплекта существующим `/intake_local`; два read-only ревью Codex CLI, во втором
«Блокирующих замечаний нет». Бот не перезапускался; ASR и рендер не запускались.
