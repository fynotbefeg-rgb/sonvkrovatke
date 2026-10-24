# Version 4: аутентифицированная проверка после установки

2026-10-12. PR #17 прочитан на `cfdc9e8`: локальный Claude сообщает об установке RomanApproval.gs/SharedReview.gs и обновлении существующего deployment с 3 на 4 без изменения Code.gs, URL, свойств, триггеров и доступа. Cloud Codex не управлял Windows и самостоятельно не читал исходники редактора. Проверенные после сохранения хеши дополнений в отчёте совпадают с LF-исходниками репозитория; CRLF-хеши PR16 нормализуются к тем же значениям.

## Реальные проверки из GitHub Actions

1. https://github.com/fynotbefeg-rgb/sonvkrovatke/actions/runs/38229911233 — roman-reels-check на automation/roman-reels-v1, только check_google_queue=true. Success: `Approved production queue items: 0`, `Read-only check complete. No videos started.`
2. https://github.com/fynotbefeg-rgb/sonvkrovatke/actions/runs/38230256036 — тот же workflow на feature/codex-pipeline @ `12d77a3`, только check_google_queue=true. Success: очередь 0; `Topic snapshot check passed: enabled=false, topics=0, productionAllowed=false. No changes performed.`

Использованы существующие ROMAN_REELS_WEBHOOK_URL/TOKEN через GitHub Secrets. Секреты не извлекались, содержимое ответов/сценариев/аккаунтов не публиковалось. Новый probe делает один authenticated POST и допустимый response-only redirect GET без передачи токена. Только чтение; флаги, approvals и производство не включены. Apify/Gemini/Claude/Drive intake/рендер jobs этого запуска пропущены.

## Изменения в репозитории

- topic-selection-reader.mjs: общий приватный транспорт, отдельная строгая проверка выключенного snapshot; активный reader и проверка provenance для планирования сохраняются. Выключенный probe не выдаёт полномочий планирования.
- check-topic-snapshot.mjs: проверка опубликованной совместимости без печати данных или секретов; всегда ожидает именно выключенный модуль.
- disabled-topic-snapshot.test.mjs: 4 теста (точный disabled контракт; включённые/непустые/устаревшие/разрешающие ответы отклонены; redirect без токена; небезопасные переходы/ошибки без утечки).
- roman-reels-check.yml: read-only проверка разрешена также на feature/codex-pipeline; send_pilot_drafts на этой ветке не разрешён. Дополнительный шаг проверяет disabled snapshot. Существующие paid/generation режимы не запускались.
- roman-shared-review-check.yml: новые тесты включены в CI.

Локально: новый набор 4/4, topic-selection-reader 24/24, shared-review 25/25 (последние два повторяют 10 импортированных базовых тестов, это не 49 независимых тестов). Синтаксис CLI и git diff --check прошли. GitHub live check success; другие CI результаты фиксировать по фактическим завершениям, не по запуску.

## Оставшиеся границы

Тема Романом пока не выбрана. Topic-first регистрации до основы/хуков ещё нет. Shared review установлен, но выключен. Нулевой результат очереди не доказывает, что все старые видимые решения корректно зарегистрированы: таблица и e.user в этой cloud проверке не анализировались. Реальное поведение триггеров, аутентифицированная legacy очередь с непустыми approvals, смена решения Романом и production end-to-end остаются не проверены. PR17 не слит, main не менялся. Первый ручной выпуск/SEO-демонстрация продолжается независимо от этого обновления.

Окно Edge осталось открытым после локальной блокировки закрытия. Для серверной работы его закрытие не является условием успешного endpoint check. Если потребуется ручной запуск второго окна с тем же профилем, освобождать только google-project штатно, не завершать все Edge/MCP процессы.
