# Windows: установка кандидата topic-first — результат

2026-10-12, около 13:04–13:08 по местному времени ноутбука. Задание WINDOWS_TOPIC_FIRST_APPLY.md (origin/feature/codex-pipeline `0857f42`) выполнено по команде владельца через MCP `playwright-google`. Script Properties не открывались. Токен, утверждающие, квитанции, флаг `ROMAN_SHARED_REVIEW_ENABLED` и триггеры не менялись. Таблица и строки не изменялись, `setupRomanApproval` не запускался. Code.gs не менялся.

## Итог

Кандидат PR #18 установлен, существующий deployment обновлён с **Version 4 на Version 5**. URL и настройки сохранены. Аутентифицированная cloud-проверка очереди и snapshot **не выполнена**: запуск workflow заблокирован проверкой разрешений сессии, обход не выполнялся.

## 1. Проверки до изменения

| Проверка | Результат |
|---|---|
| Локальный кандидат 20261012-124850-topic-first (`SHA256SUMS`) | OK |
| Приватный backup V4 20261012-124829-v4 (`SHA256SUMS`) | OK |
| Живой Code.gs | `01723065194af3c2f26d09101da388575b3a12611a1e61de58e6d440ee6fa16b`, совпадает |
| Живой RomanApproval.gs | `9f18a05e6435031d0120508aba77678ffce469040a045bd0b4051cf24a30961e`, совпадает |
| Живой SharedReview.gs | `0255877adb3656df93e23414b18cc95e407c417ddc9afc8358851d3035481776`, совпадает |
| Опубликованная версия | Version 4 (12 окт. 2026, 12:19), Web app, Execute as Me, Who has access Anyone; 1 активный deployment |
| URL web app, SHA256[:16] | `8537ec3d6781766b` |

Замечание: в списке архивных deployments 3 записи; при проверке Version 3 было 2. На активный deployment это не влияет. Архивные записи не открывались и не менялись.

## 2. Применение

Содержимое бралось из raw GitHub на `e14c1a5`. Перед вставкой хеш сверялся с SHA кандидата, и вставка шла только при совпадении. Дополнительно перед заменой проверялось, что в редакторе открыт именно ожидаемый V4-файл.

| Файл | До (V4) | После сохранения и перезагрузки редактора |
|---|---|---|
| Code.gs | `01723065…` | `01723065194af3c2f26d09101da388575b3a12611a1e61de58e6d440ee6fa16b` (не менялся) |
| RomanApproval.gs | `9f18a05e…` | `84d8d59f7b2d7e2bc31d799a76d106d24d081a00950b1512d25091f031cb1e73` |
| SharedReview.gs | `0255877a…` | `a1d441bac0734f0eb602fd8252186cc88e49e1de9bf3c126dabf0432fe3e1094` |

Порядок файлов в проекте сохранён: Code.gs → RomanApproval.gs → SharedReview.gs.

## 3. Deployment

Manage deployments → Edit (существующий) → Version: New version → Deploy. Новый deployment не создавался.

| | До | После |
|---|---|---|
| Версия | Version 4 | **Version 5**, 12 окт. 2026, 13:07 |
| Execute as | Me | Me (не трогал) |
| Who has access | Anyone | Anyone (не трогал) |
| URL, SHA256[:16] | `8537ec3d6781766b` | `8537ec3d6781766b` (тот же URL) |
| Запрос повторной авторизации | — | не появлялся |

## 4. Проверки после установки

| Проверка | Результат |
|---|---|
| GET на прежний URL | `{ok:false, error:"Use authenticated POST"}` |
| POST `get_topic_research_snapshot` без токена | `{ok:false, error:"Unauthorized"}` |
| POST `add_topic_review` с неверным токеном (пустой packet) | `{ok:false, error:"Unauthorized"}`: запись невозможна |
| `roman-reels-check` на feature/codex-pipeline, только `check_google_queue=true` (очередь + disabled snapshot) | **NOT_TESTED**: запуск workflow заблокирован проверкой разрешений; это не успех теста |
| Реальный выбор темы Романом (`e.user`) | не проверялся, флаг выключен |

## Откат (если cloud-проверка не пройдёт)

1. В редакторе вернуть RomanApproval.gs и SharedReview.gs из backup 20261012-124829-v4 и проверить LF SHA256 (`9f18a05e…`, `0255877a…`). Code.gs не трогать. Это обязательно: триггеры выполняют текущий код проекта, а не версию web app.
2. Manage deployments → Edit → Version 4 → Deploy, сохранив URL и настройки.
3. Флаг остаётся выключенным, backup не удалять.

## Требуется

Полная проверка с GitHub Secrets: `roman-reels-check` на feature/codex-pipeline с единственным `check_google_queue=true`. Ожидаются прежняя очередь (последняя — 0) и snapshot `enabled=false, topics=0, productionAllowed=false`. Её может запустить владелец или Codex после сообщения владельца.
