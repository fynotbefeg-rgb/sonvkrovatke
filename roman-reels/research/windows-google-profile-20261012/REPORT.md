# Windows: отдельный профиль Google и окно входа, 2026-10-12

Задание: WINDOWS_GOOGLE_PROFILE_SETUP.md на origin/feature/codex-pipeline bdd46b6. Выполнено локальной сессией Claude Code на Windows. Ничего не развёртывалось.

## Итог: подготовлено, ждёт входа владельца

| Шаг | Статус | Наблюдение |
|---|---|---|
| fetch, чтение задания | PASS | origin/feature/codex-pipeline = bdd46b6 |
| Старый MCP `playwright` | сохранён | флаги без изменений: `--browser --isolated --headless --output-dir`; процесс MCP работает |
| Каталоги | созданы | `%LOCALAPPDATA%\RomanReels\browser-profiles\google-project` и `%LOCALAPPDATA%\RomanReels\mcp-google-output`; раньше не существовали, ничего не перезаписано |
| Поддержка флагов в @playwright/mcp | PASS | установленная версия 0.0.83: `--browser`, `--user-data-dir`, `--output-dir` есть в `--help` |
| Регистрация `playwright-google` | PASS | `claude mcp add -s user`, тот же node.exe v24.21.0 и тот же cli.js; флаги `--browser msedge --user-data-dir <google-project> --output-dir <mcp-google-output>`, без `--isolated`/`--headless`, без `--port`/`--host`. Имя было свободно |
| Инструменты `playwright-google` в текущей сессии | нет | регистрация подхватится только новой сессией Claude; браузер нового MCP в этом этапе не запускался |
| Окно Edge для ручного входа | PASS | обычный запуск `msedge.exe` с `--user-data-dir=<google-project> --no-first-run --new-window` и только адресом проекта Apps Script; окно видно на интерактивном рабочем столе (сессия 1, console, Active), заголовок «Google Диск: вход в систему — Профиль 1: Microsoft Edge» |
| Сетевые порты окна | PASS | без `--remote-debugging-port`; у процессов этого профиля нет слушающих сокетов |

## Чего не делал

Почту, пароль, 2FA не вводил, вход и CAPTCHA не автоматизировал, аккаунт не выбирал, cookies не переносил. Личный профиль Edge и другие профили не открывал и не читал. Код, deployments, триггеры, Script Properties, таблицу, sharing и OAuth не трогал. Node, Edge и Playwright не переустанавливал. Профиль, cookies и локальная конфигурация MCP в Git не попадают; конфиг целиком не печатался.

## Дальше

1. Владелец входит в открытом окне через удалённый доступ.
2. После сообщения о входе — штатно закрыть только окно этого профиля (не все Edge/Node, не старый MCP), чтобы освободить профиль для `playwright-google`.
3. В новой сессии Claude с инструментами `playwright-google` выполнить read-only проверку по WINDOWS_APPS_SCRIPT_PREFLIGHT.md. Подготовка окна сама по себе не подтверждает доступ к проекту.
