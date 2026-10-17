# Version 5: проверка после установки

2026-10-12. Codex прочитал PR19 `303daa0`: Windows Claude сообщает о применении точно проверенных RomanApproval.gs/SharedReview.gs, сохранении legacy Code.gs, URL/settings/триггеров/свойств и обновлении существующего deployment с Version 4 на 5. Флаг выключен, строк/решений не создавалось. Source SHA в отчёте совпадают с кандидатом PR18; cloud напрямую редактор Windows не контролировал.

## Реальные Actions проверки с существующим токеном

- https://github.com/fynotbefeg-rgb/sonvkrovatke/actions/runs/38236462629 — **failure**. `get_production_queue` вернул не-JSON HTTP 404; snapshot step не выполнялся. Не считать этот запуск успешным и не делать вывод, что очередь была пустой.
- После этого выполнен один отдельный диагностический повтор того же разрешённого read-only запуска: https://github.com/fynotbefeg-rgb/sonvkrovatke/actions/runs/38236678240 — **success**. `Approved production queue items: 0`, `Read-only check complete. No videos started.`, `Topic snapshot check passed: enabled=false, topics=0, productionAllowed=false. No changes performed.`

В обоих запусках `roman-reels-check` на feature/codex-pipeline @ `0857f42`, единственный включённый флаг check_google_queue. Paid/generation/Drive intake/рендер режимы выключены. В промежутке cloud Codex не менял deployment, код, секреты или таблицу. Причина первого 404 не установлена: последующий успех показывает восстановление ответа, но не доказывает конкретную причину и долговременную надёжность. Автоматический retry/fallback, импорт approvals или запуск производства не добавлялись.

Использованы существующие GitHub Secrets, значения не выводились. Endpoint с действующим токеном проверен на пустой очереди и выключенном модуле. Настоящий topic-only выбор через e.user, непустая очередь и generation end-to-end ещё не проверены. Включение флага/регистрация актуальных тем остаётся следующим контролируемым шагом после подготовки реального packet; нельзя выдавать видимые старые решения за новые receipts.

PR19 не слит, main не менялся. Резервная копия Version 4 остаётся на Windows. При повторяющемся 404 проверить активный deployment и адрес без публикации URL/токена; полный откат описан в WINDOWS_TOPIC_FIRST_APPLY.md, включая восстановление редакторных файлов для триггеров.
