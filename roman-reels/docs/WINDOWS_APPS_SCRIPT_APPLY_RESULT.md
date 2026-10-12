# Windows: применение кандидата Apps Script (PR #16) — результат

2026-10-12, примерно 12:10–12:20 по местному времени ноутбука. Выполнено по явному разрешению владельца через MCP `playwright-google` (Edge, профиль `google-project`). Script Properties не открывались. Токен, утверждения, триггеры, feature flags и Code.gs не менялись. `setupRomanApproval` не запускался.

## Итог

Кандидат установлен. Существующий deployment обновлён до **Version 4**, URL и настройки остались прежними. Аутентифицированная проверка очереди и snapshot **не выполнена**: запуск штатного read-only workflow заблокирован проверкой разрешений сессии, обход не выполнялся.

## 1. Повторная сверка перед изменением

| Файл в живом проекте | SHA256 перед изменением | Backup 20261012-102258 |
|---|---|---|
| Code.gs | `01723065194af3c2f26d09101da388575b3a12611a1e61de58e6d440ee6fa16b` | совпадает |
| RomanApproval.gs | `cd8bca7649b06c595e10380e23ba3c704496672e57c55bd6d52f1c7325f8adc9` | совпадает |

Других файлов не было. Расхождений нет, поэтому продолжил.

## 2. Применённые файлы

Содержимое загружалось в редактор прямо из коммита PR #16 (`99a9417`, raw GitHub). SHA256 сверялся до вставки и после перезагрузки редактора, то есть по сохранённому на сервере состоянию.

| Файл | Действие | SHA256 после сохранения (LF) |
|---|---|---|
| Code.gs | без изменений | `01723065194af3c2f26d09101da388575b3a12611a1e61de58e6d440ee6fa16b` |
| RomanApproval.gs | замена содержимого на `roman-reels/apps-script/RomanApproval.gs` @ `99a9417` | `9f18a05e6435031d0120508aba77678ffce469040a045bd0b4051cf24a30961e` |
| SharedReview.gs | новый файл, третий по порядку, `roman-reels/apps-script/SharedReview.gs` @ `99a9417` | `0255877adb3656df93e23414b18cc95e407c417ddc9afc8358851d3035481776` |

В PR #16 для этих двух файлов указаны хеши CRLF-копий из Windows worktree: `c9137ca1…` и `4f33ce82…`. По содержимому файлы идентичны: после нормализации переводов строк хеши совпадают с блобами репозитория. Файлы в `roman-reels/apps-script/` на текущей origin/feature/codex-pipeline (`42d0455`) не менялись с `36a479d`.

## 3. Deployment

| | До | После |
|---|---|---|
| Активные deployments | 1 (Web app), архивных 2 | без изменений |
| Версия | Version 3, 9 окт. 2026 | **Version 4**, 12 окт. 2026, 12:19 |
| Execute as | Me | Me (не трогал) |
| Who has access | Anyone | Anyone (не трогал) |
| URL web app (SHA256, первые 16 символов) | `8537ec3d6781766b` | `8537ec3d6781766b` — тот же URL |

Порядок действий: Deploy → Manage deployments → Edit → Version: New version → Deploy. Новый deployment не создавался. Google не запрашивал повторную авторизацию.

## 4. Проверки после обновления

| Проверка | Результат |
|---|---|
| GET на прежний URL | `{ok:false, error:"Use authenticated POST"}` |
| POST `get_topic_research_snapshot` без токена | `{ok:false, error:"Unauthorized"}` |
| POST `get_production_queue` с неверным токеном | `{ok:false, error:"Unauthorized"}` |
| Аутентифицированная очередь (`check-production-queue.mjs` через `roman-reels-check`, `check_google_queue`, ветка automation/roman-reels-v1) | **NOT_TESTED**: запуск workflow заблокирован проверкой разрешений |
| Аутентифицированный snapshot при выключенном флаге | **NOT_TESTED**: локально токена нет, Script Properties не открывались, штатного workflow для snapshot нет |

Локальные регрессии PR #16 (19/19) покрывают ожидаемое поведение: прежний контракт очереди и при выключенном флаге `{ok:true, enabled:false, topics:[]}` без записи. На живом endpoint это пока не подтверждено.

## Откат

Manage deployments → Edit → Version 3 → Deploy. URL сохранится. При необходимости вернуть в редакторе RomanApproval.gs из backup (`cd8bca76…`) и удалить SharedReview.gs. Code.gs, свойства и триггеры не менялись.

## Нужное действие владельца

Запустить Actions → `roman-reels-check` на ветке `automation/roman-reels-v1` с единственным флагом `check_google_queue`. Ожидается: `Approved production queue items: N` и `Read-only check complete`. Для snapshot отдельного workflow нет. Его можно проверить локально через `topic-selection-reader` с секретами владельца; ожидается `enabled:false` и пустой `topics`.

## Прочее

Закрыть вкладку браузера MCP после работы не удалось: команду закрытия тоже отклонила проверка разрешений. Окно профиля `google-project`, запущенное MCP, может оставаться открытым.
