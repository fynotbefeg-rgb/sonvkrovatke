# Windows: проверка живого Apps Script — результат

2026-10-12. Задание WINDOWS_APPS_SCRIPT_PREFLIGHT.md (origin/feature/codex-pipeline bdd46b6), продолжение PR #14. Выполнено локальной сессией Claude Code на Windows через MCP `playwright-google` (Edge, профиль `google-project`).

## Итог: доступ есть, поддержки нового action в живом проекте нет

| Пункт | Статус | Наблюдение |
|---|---|---|
| Профиль `google-project` занят | снято | штатно закрыто только окно Edge этого профиля; другие процессы не трогались, lockfile исчез |
| Доступ аккаунта к проекту через MCP | PASS | редактор «Roman Reels Automation - Project Editor» открылся без входа/запроса прав (адрес почты не фиксировался) |
| Видимые файлы | PASS | `Code.gs`, `RomanApproval.gs` (2 файла). `SharedReview.gs` нет. Манифест `appsscript.json` скрыт настройками редактора, не проверялся |
| Просмотр кода | PASS | код читается из редактора; в stdout/отчёт не выводился |
| Private backup | создан | локально в LOCALAPPDATA/RomanReels/apps-script-backup/20261012-102258, 2 файла (см. SHA256 ниже); в Git не добавлялся |
| Deployments | NOT_TESTED | открытие меню Deploy заблокировано политикой разрешений этой сессии (действие похоже на развёртывание); обходных путей не искали |
| Script Properties | не открывались | — |

### Структурные признаки (подсчёт регулярными выражениями, не доказательство корректности)

| Признак | Code.gs (209 строк) | RomanApproval.gs (439 строк) |
|---|---|---|
| `function doPost` | 0 (есть `legacydoPost`) | **2** (строки 356 и 421) |
| `function onRomanApprovalEdit` | 0 | **2** (строки 132 и 425) |
| `function setupRomanApproval` | 0 | 2 |
| проверка `e.user` | нет | есть (3 упоминания) |
| POST action, найденные строкой | `get_production_queue` | `get_production_queue` |
| `get_topic_research_snapshot` | нет | нет |
| SharedReview / topicSnapshot | нет | нет |
| прочее | `testConnection`, `getProductionQueueResponse`, LockService, проверка токена | `romanApprovalQueueV1`, `romanApprovalSafetyV1`, `doGet`, `getApprovedProductionQueue`, `markApprovedForProduction`, `checkProductionSafety`, LockService, проверка токена |

SHA256 (LF, как в редакторе):
- Code.gs — `01723065194af3c2f26d09101da388575b3a12611a1e61de58e6d440ee6fa16b`
- RomanApproval.gs — `cd8bca7649b06c595e10380e23ba3c704496672e57c55bd6d52f1c7325f8adc9`

Ни один файл не совпадает с версиями в репозитории (`roman-reels/apps-script/*.gs` в 7f9e152, a71efce, fc441ce: 217–247 строк против 209/439 вживую).

## Вывод о схеме установки

- Фактически используется схема «Code.gs + RomanApproval.gs одновременно»: в `Code.gs` старый обработчик переименован в `legacydoPost`, а действующие `doPost`/`onRomanApprovalEdit` находятся в `RomanApproval.gs`.
- В `RomanApproval.gs` по две декларации `doPost`, `onRomanApprovalEdit`, `setupRomanApproval`. В Apps Script действует последняя загруженная декларация (строки 421/425); по виду это похоже на вставку второго блока поверх первого (`romanApprovalQueueV1`/`romanApprovalSafetyV1`), но корректность цепочки вызовов не проверялась.
- Новый action `get_topic_research_snapshot` и модуль SharedReview отсутствуют. Для reader нужен новый файл `SharedReview.gs` и правка действующего `doPost` (или замена `RomanApproval.gs` на сгенерированную версию) плюс **новая версия существующего deployment** с сохранением URL, токена и триггеров. Без этого клиент reader на текущем endpoint получит неизвестный action и остановится (как описано в TOPIC_SELECTION_READER.md).
- Перед заменой нужно решить, как поступить с дублями деклараций в живом `RomanApproval.gs`, и сверять правку с этим бэкапом, а не с файлами репозитория.

## Shared-темы и topic-only регистрация

- Зарегистрированные shared-темы для reader: в живом проекте нет кода shared review / topicSnapshot, поэтому reader сейчас читать нечего; содержимое таблицы не открывалось.
- Topic-only регистрации до основы/хуков: нет (ни в живом проекте, ни как готового этапа). Фиктивные body/hooks не создавались, прежние решения не импортировались.

## Что не проверено

Deployments (версия, URL, тип доступа), триггеры, манифест `appsscript.json`, содержимое таблицы, реальное поведение `doPost` и проверки `e.user`. Код, deployments, триггеры, таблица, feature flags и токены не менялись; Script Properties не открывались.

## Нужное действие владельца

Только для deployments: либо разрешить одно чтение «Deploy → Manage deployments» в следующей сессии, либо посмотреть самому и сообщить число активных deployments и номер версии (без URL и токена).
