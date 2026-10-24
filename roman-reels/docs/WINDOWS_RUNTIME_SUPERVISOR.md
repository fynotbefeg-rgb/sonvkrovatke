# Устойчивый запуск бота и приёмщика на Windows — кандидат

2026-10-13. Код, тесты и инструкция. Задача в планировщике **не создавалась**, системные настройки не менялись.

## Что делает один проход

`node scripts/run-windows-supervisor.mjs --ensure [--bot-deployment-approved] [--receive]` (из `roman-reels`):

1. Получает список процессов Windows и классифицирует бот (`windows-runtime-supervisor.mjs → inspectBot`):
   `running` (ровно один `run-telegram-panel.mjs --windows-serve`, lock принадлежит ему), `stopped` (нет ни
   процесса, ни lock), `stale_lock` (lock есть, его PID не существует, поллеров нет), `conflict` (всё остальное).
2. `running` и `conflict` — ничего не делает. Конфликт (два поллера, поллер без lock, живой чужой PID в lock,
   нечитаемый lock) только сообщается.
3. `stopped` / `stale_lock` — только при флаге `--bot-deployment-approved`: перед удалением lock повторно читает
   его и список процессов, удаляет только этот lock, запускает один отсоединённый поллер. Флаг
   `ROMAN_TELEGRAM_DEPLOYMENT_APPROVED=true` передаётся только дочернему процессу. Журналы —
   `serve-stdout-<время>.log`, состояние — `supervisor-state.json` и `serve.pid`.
4. Ждёт до 60 с событий `telegram_identity_verified` и `telegram_poll_completed`; результат `confirmed`,
   `identity_only`, `unconfirmed` или `stopped_after_start` сообщается как есть.
5. Не больше 3 запусков за час: дальше `crash_loop` (например, отозванный токен), без бесконечных перезапусков.
6. С `--receive` — один проход `ack-windows-plan.mjs` (тайм-аут 5 мин). Его сбой не влияет на бот. Устаревший
   `receive.lock` и `.partial` не удаляются: их проверяют вручную (WINDOWS_PLAN_DELIVERY.md).
7. Второй одновременно работающий супервизор → `supervisor_busy`.

`--status` — только классификация без изменений. Проверено вживую 2026-10-13: `running`, PID текущего бота.

DPAPI-конфиг, SQLite, курсор, Google, Drive и флаг согласования не меняются. Генерация, загрузка видео и монтаж
не запускаются.

## Запуск по расписанию — инструкция, не выполнялась

Нужен вход пользователя: DPAPI CurrentUser и OAuth-токены доступны только в его сеансе. Поэтому режим
«только при входе пользователя», без хранения пароля.

```powershell
$repo = 'C:\Users\Антон\work\sonvkrovatke\roman-reels'
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$repo\scripts\windows\ensure-roman-runtime.ps1`" -BotDeploymentApproved -Receive"
$t1 = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$t2 = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
$s = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -StartWhenAvailable
Register-ScheduledTask -TaskName 'RomanReels-Runtime' -Action $a -Trigger $t1,$t2 -Settings $s -User $env:USERNAME -RunLevel Limited
# откат: Unregister-ScheduledTask -TaskName 'RomanReels-Runtime' -Confirm:$false
```

Ограничения, не проверенные вживую:
- Отсоединённый поллер должен пережить завершение задачи. Если планировщик завершит его вместе с задачей,
  следующий проход через 5 минут сообщит `stopped`/`stale_lock` и запустит заново. Нужен один ограниченный
  живой тест после разрешения владельца.
- После перезагрузки без входа в Windows ничего не запустится (автовход и настройки питания не меняются).
- Перед первым включением остановить вручную запущенный бот не нужно: супервизор увидит `running`.

## Тесты

`windows-runtime-supervisor.test.mjs`, 9 офлайн-тестов: работающий бот, запуск остановленного с подтверждением,
устаревший lock после сбоя/перезагрузки, пять неоднозначных состояний без вмешательства, изменение lock во время
проверки, отсутствие разрешения, лимит перезапусков и возобновление, неподтверждённый старт, приёмщик и
параллельные супервизоры. Зарегистрирован в Linux и Windows CI.

## Обновлённая установка (2026-10-13) — каждый шаг по отдельному разрешению владельца

Важное уточнение: супервизор считает поллеры **на всей машине** (по командной строке), а не по каталогу
состояния — на ноутбуке допускается только один бот. Поэтому испытание в отдельном каталоге при работающем
боте невозможно: он увидит `conflict`.

0. Предварительная проверка без изменений: `node scripts/run-windows-supervisor.mjs --status` → `running`, PID
   текущего бота; `git log --oneline -1` — ожидаемая версия.
1. **Разрешение A — ограниченный живой тест (останавливает бот примерно на 1 минуту).**
   - сверить PID по команде и `serve.pid`, остановить только его (`Stop-Process -Id <PID>`);
   - `powershell -NoProfile -File scripts\windows\ensure-roman-runtime.ps1 -BotDeploymentApproved -Receive`;
   - ожидается `supervisor-last.json`: `action=started`, `clearedStaleLock=true`, `confirmation=confirmed`,
     `receiver=ok/waiting`; затем `--status` → `running` с новым PID; проверка с телефона `/start`;
   - откат: если не подтвердилось — запустить бот прежней командой (`ROMAN_TELEGRAM_DEPLOYMENT_APPROVED=true`
     только для процесса, `--windows-serve`), база и курсор сохраняются.
2. **Разрешение B — регистрация задачи планировщика** (команда выше в этом документе), затем один ручной
   запуск задачи: `Start-ScheduledTask RomanReels-Runtime` → `--status` остаётся `running` с тем же PID
   (второй поллер не запускается). Откат: `Unregister-ScheduledTask`.
3. **Разрешение C — проверка выживания поллера**: дождаться завершения задачи; если поллер исчез вместе с
   задачей, следующий проход через 5 минут запустит его снова — это фиксируется как ограничение, и задачу
   нужно перенастроить (например, отдельная задача только для поллера).
4. Перезагрузка — только по отдельному решению владельца; после неё нужен вход в Windows.

Этот PR сам не выполняет живых действий. По актуальному WEEK_HANDOFF.md владелец уже сообщил о выполнении A/B/C и регистрации задачи; не повторять их без нового разрешения. Перезагрузка остаётся непроверенной.
