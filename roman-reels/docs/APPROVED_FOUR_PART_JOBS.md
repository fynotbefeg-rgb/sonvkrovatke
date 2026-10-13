# Актуальные утверждения → четыре задания загрузчика

Модуль `approved-four-part-jobs.mjs` готовит данные, не выполняет генерацию,
загрузку, монтаж или изменения Google. Это следующий адаптер после PR26.

## Вход и строгая привязка

- Исходный shared-review-v1 пакет: точная тема, одна основа, три хука,
  одна версия и пустые endings. При двух окончаниях режим отклоняется;
  они не теряются и не заменяются фиктивными.
- Явные пути четырёх локальных будущих/скачанных MP4: body, hook-1/2/3.
  Название «Видео аватара» не позволяет угадать тему или роль.
- Свежий ответ защищённого get_production_queue. Reader передаёт токен
  только в POST Apps Script; redirect допускается лишь к response-only
  Googleusercontent /macros/echo, GET без исходного body/headers/token.
  Размер ответа ограничен200000байт, время запроса30с. Нет fallback/retry.

Сохранённый JSON не является авторизацией. Reader отмечает исходный объект
в WeakMap; planner проверяет неизменённость и локальное время чтения≤5мин.
Дата локального чтения не становится датой утверждения Романа.

Необходимы все три точных full-script записи с matching revision/hash,
shared_review.packetHash и серверными componentHashes темы/основы/хука.
Хук receipt включает hash общей основы, как в текущем SharedReview.gs.
Нужен один shared approver; future timestamps, legacy records без shared
proof, изменённые тексты/тема/версия блокируются. Пустой/частичный выбор
нормально даёт awaiting_exact_approvals без задания.

## Выход

План содержит четыре upload jobs существующей схемы, явные localPath/роль,
детерминированный jobId, title из binding и raw UTF-8 textHash части.
Windows пути поддержаны, совпадающие/относительные/partial/unsafe пути запрещены.
Работоспособность файлов проверит сам загрузчик; planner их не открывает.

Рядом packet.json для существующего four-part intake и receipt finalizer:
точные тексты и legacy hashes сохраняются. Status pending_approval внутри
этого нейтрального декларативного пакета не меняет живое утверждение:
intake повторно читает реальную очередь. Нет actor/timestamp в uploader jobs.
GenerationAllowed/renderAllowed=false; currentApprovalRecheckRequired=true.
Даже сохранённый planned-пакет не разрешает HeyGen или производство.

## CLI только в доверенной облачной среде

```text
node roman-reels/scripts/plan-approved-four-part-jobs.mjs \
  exact-shared-review.json explicit-role-bindings.json NEW-private-directory
```

Существующие ROMAN_REELS_WEBHOOK_URL/TOKEN берутся из текущей защищённой среды.
Не переносить секреты из GitHub на Windows. Пример role-bindings:

```json
{
  "body": {"localPath": "C:\\RomanReels\\downloads\\body.mp4"},
  "hook-1": {"localPath": "C:\\RomanReels\\downloads\\hook-1.mp4"},
  "hook-2": {"localPath": "C:\\RomanReels\\downloads\\hook-2.mp4"},
  "hook-3": {"localPath": "C:\\RomanReels\\downloads\\hook-3.mp4"}
}
```

Это пример будущего явного binding, папка здесь не создаётся. Output новый,
приватный, не перезаписывается; план/packet/jobs не писать в Git или публичный
artifact (в них речь клиента). CLI печатает только статус/счётчик/запреты,
не тексты и токены. --check-access читает только очередь без сохранения данных.

## Что ещё не включено

Реальный shared-review feature ранее был disabled; текущие решения/очередь
проверяются отдельно. Регистрация новых тем/сценариев, доставка планов Windows,
запуск по расписанию, автоматическое создание файлов HeyGen и свежий ASR
не реализуются этим адаптером. Разрешение HeyGen остаётся отдельным blocker.
Никакого live утверждения/Google deployment/module enable здесь нет.

Восемь автономных тестов: exact/source parity Python + uploader/receipt schemas,
пустой/частичный выбор, saved/mutated/stale authority, source/receipt changes,
invalid/future/duplicate approvals, paths, redirect без token leak,
HTTP/network/invalid/oversize fail-closed. Все8 прошли локально без сервисов.
