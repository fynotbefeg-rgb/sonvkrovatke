# Windows: проверка живого Apps Script — результат

2026-10-12. Задание WINDOWS_APPS_SCRIPT_PREFLIGHT.md (origin/feature/codex-pipeline bdd46b6). Выполнено локальной сессией Claude Code на Windows после сообщения владельца о входе в Google в профиле `google-project`.

## Итог: BLOCKED — инструменты playwright-google недоступны в текущей сессии

| Пункт | Статус | Наблюдение |
|---|---|---|
| fetch, чтение документа | PASS | origin/feature/codex-pipeline = bdd46b6 |
| MCP `playwright-google` зарегистрирован | PASS | есть в пользовательской конфигурации (PR №10) |
| Инструменты `playwright-google` в текущей сессии | нет | поиск инструментов не находит ни одного `mcp__playwright-google__*`; сервер зарегистрирован после старта этой сессии и подхватится только новой сессией Claude Code |
| Старый `playwright` (headless/isolated) | не использовался | без сессии Google; по заданию профиль/cookies не переносятся |
| Окно Edge профиля `google-project` | открыто | заголовок окна: «Roman Reels Automation - Project Editor - Apps Script». Это косвенный признак, что вошедший аккаунт открывает редактор проекта; это заголовок окна ОС, а не проверка через MCP |
| Профиль занят | да | в каталоге профиля есть `lockfile`: пока окно открыто, `playwright-google` не сможет запустить браузер с этим профилем |
| Доступ к проекту через MCP | NOT_TESTED | — |
| Имена файлов, doPost / onRomanApprovalEdit, e.user, POST actions, SharedReview / topicSnapshot | NOT_TESTED | — |
| Deployments | NOT_TESTED | — |
| Private backup | не создан | backup unavailable в этом запуске; файлы из репозитория вместо него не подставлялись |

Script Properties не открывались. Код, deployments, триггеры, таблица, feature flags и токены не менялись. Секреты, адрес почты, cookies и исходный код не выводились.

## Зарегистрированные shared-темы и topic-only регистрация

Не проверено в живом проекте. По TOPIC_SELECTION_READER.md reader работает только с темами уже зарегистрированного shared packet; topic-only регистрации до основы/хуков пока нет. Фиктивные body/hooks не создавались, прежние решения не импортировались.

## Что нужно для продолжения

1. Новая сессия Claude Code на ноутбуке (в ней появятся инструменты `playwright-google`).
2. В начале новой сессии штатно закрыть только окно Edge профиля `google-project` (не все Edge и не старый MCP), чтобы снять блокировку профиля. Вход в Google сохраняется в профиле.
3. Повторить WINDOWS_APPS_SCRIPT_PREFLIGHT.md п. 2–6 через `playwright-google` и обновить этот отчёт в той же ветке.
