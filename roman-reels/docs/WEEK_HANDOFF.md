# Передача проекта на неделю без Codex

Составлено 2026-10-13 локальным Claude на ноутбуке владельца. Основа: `feature/codex-pipeline` @ `31aaa47`.
`main` не меняется. Каждый законченный этап — отдельная ветка и PR в `feature/codex-pipeline`; PR сливает
только владелец.

## Неизменные правила

- Роман ещё **не** просмотрел и не утвердил темы. Старые отметки и тестовые пакеты не являются согласованием.
- HeyGen, платные вызовы, генерация аватара, монтаж, рендер и производство не запускаются.
- Секреты не извлекаются из GitHub, резервных копий, браузера или снимков; токены не выводятся.
- Google (Apps Script, флаги, строки, утверждения, триггеры) меняется только по отдельному разрешению.
- Отказ в разрешении не обходится — сообщается причина.

## Текущее состояние (проверено 2026-10-13)

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

## Ветки этой недели (PR не созданы — в этой среде нет инструментов GitHub; дубликатов не найдено)

| Этап | Ветка | Коммит | Ссылка для PR |
|---|---|---|---|
| 0. Этот документ | `feature/windows-week-handoff-20261013` | — | https://github.com/fynotbefeg-rgb/sonvkrovatke/compare/feature/codex-pipeline...feature/windows-week-handoff-20261013?expand=1 |
| 3. Устойчивый запуск | `feature/windows-runtime-supervisor-20261013` | `da08a24` | https://github.com/fynotbefeg-rgb/sonvkrovatke/compare/feature/codex-pipeline...feature/windows-runtime-supervisor-20261013?expand=1 |
| 4. Очередь → передача | `feature/windows-queue-delivery-bridge-20261013` | `87967ce` | https://github.com/fynotbefeg-rgb/sonvkrovatke/compare/feature/codex-pipeline...feature/windows-queue-delivery-bridge-20261013?expand=1 |

Ветки 3 и 4 добавляют по строке в одно место `.github/workflows/roman-source-set-tests.yml`. После слияния
первой во второй будет простой конфликт: оставить обе строки тестов.

Старые ветки `feature/windows-plan-ack-20261013` и `feature/windows-review-status-clock-skew-20261013` уже
вошли в `feature/codex-pipeline` (PR №32–36).

## Последовательные задания

### 1. Настройка подтверждений получения — ВЫПОЛНЕНО
Критерий: слот создан и проверен, конфиг сохранён, пустой ящик → `waiting` без записи. Выполнено (см. таблицу).

### 2. Один вымышленный пакет: передача, подтверждение, повтор без дублей — ЗАБЛОКИРОВАНО
Блокер: в репозитории нет workflow, который запускает `publish-windows-plan.py` (сериализованный облачный
писатель с `GDRIVE_SA_JSON` и `ROMAN_WINDOWS_DELIVERY_*`). Писать ящик OAuth владельца с ноутбука — отступление
от принятой модели «один облачный писатель», без разрешения не делается.
Действие владельца: выбрать одно — (а) поручить Codex настроить workflow публикации; (б) разрешить одноразовую
публикацию вымышленного пакета OAuth владельца с ноутбука.
Критерий завершения: ящик содержит вымышленный `staging_only` пакет; `ack-windows-plan.mjs` → `received` +
`acknowledged`; повтор новым процессом → `already_received` + `already_acknowledged`, без новой записи;
`isAcknowledged` = true; затем ящик возвращён в `empty` тем же писателем; генерации и загрузки нет.

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
Осталось: решить транспорт outbox → почтовый ящик (см. документ, варианты а/б/в) и источник пакета
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
