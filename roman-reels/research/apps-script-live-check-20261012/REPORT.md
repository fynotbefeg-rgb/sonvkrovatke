# Живой Apps Script: проверка доступа, 2026-10-12

Выполнено локальной сессией Claude Code на Windows через Playwright MCP (Edge 155 headless, существующая конфигурация MCP без изменений). Задание: TOPIC_SELECTION_READER.md на origin/feature/codex-pipeline 7f9e152.

## Результат: BLOCKED — нужен вход Google

| Шаг | Статус | Наблюдение |
|---|---|---|
| `git fetch origin` | PASS | origin/feature/codex-pipeline = 7f9e152 |
| Чтение TOPIC_SELECTION_READER.md | PASS | прочитан через `git show` |
| Открытие проекта `1XxdsdAGLMf1IY15812fwW5EQp6MJoCgDm7J96H10h0xk_Hykd_utvnd1` | BLOCKED | `browser_navigate` перенаправил на `https://accounts.google.com/v3/signin/identifier?...continue=https://script.google.com/d/<project>/edit...`, заголовок «Google Диск: вход в систему» |
| Доступ к проекту | NOT_TESTED | в браузере MCP нет сессии Google |
| Имена файлов живого проекта | NOT_TESTED | редактор не открылся |
| Наличие SharedReview / topicSnapshot в живом проекте | NOT_TESTED | редактор не открылся |
| Совместимость живого кода с get_topic_research_snapshot | NOT_TESTED | — |

Вызванные инструменты MCP: `browser_navigate` (один раз). Учётные данные не вводились, вход не выполнялся.

## Чего не делал

Код, deployments, триггеры, Script Properties и таблица не открывались и не менялись. Секреты не читались. Конфигурация и профиль браузера MCP не менялись.

## Ожидаемое по репозиторию (для будущей сверки, не живые данные)

На 7f9e152 в `roman-reels/apps-script/` есть `Code.gs`, `RomanApproval.gs`, `SharedReview.gs`. Действие `get_topic_research_snapshot` обрабатывается в `Code.gs:210` и `RomanApproval.gs:213`, функция `topicSnapshot` определена в `SharedReview.gs:184`. Это содержимое Git; есть ли оно в живом проекте, не проверено.

## Одно необходимое действие владельца

Разрешить отдельный постоянный профиль браузера для Playwright MCP с видимым окном на ноутбуке и самому войти в нём в Google-аккаунт, у которого есть доступ к этому проекту Apps Script. Сейчас браузер MCP работает без окна и без сохранённого профиля, поэтому войти в нём нельзя. Изменение профиля MCP — отдельный согласуемый этап (WINDOWS_FIRST_CHECK.md, п. 4). После входа повторить эту проверку только на чтение.
