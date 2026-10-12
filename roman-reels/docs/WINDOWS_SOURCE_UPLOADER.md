# Windows-загрузчик исходников в Drive incoming

2026-10-12. Первый этап: файл, скачанный из HeyGen на ноутбук, по **явному заданию** попадает в существующую incoming `1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ` → `<topicId>/v<scriptVersion>/<role>.mp4`. Оттуда его забирает облачный приёмщик (DRIVE_AUTOMATIC_INTAKE.md). HeyGen не управляется, утверждения и облачный `intake-state-v1.json` не трогаются, постоянный запуск не включён.

## Авторизация: проверено на ноутбуке 2026-10-12

| Способ | Наблюдение |
|---|---|
| Вход в Edge (профиль google-project) | не считается авторизацией Drive API, не используется, cookies не извлекаются |
| Локальный rclone remote `roman-drive` (%APPDATA%\rclone\rclone.conf, создан 9 окт.) | собственный OAuth-клиент; refresh-токен рабочий (обновление HTTP 200, аккаунт владельца), но **scope `drive.file`**: incoming и assets → **HTTP 404**. Этот scope видит только файлы, созданные самим приложением, поэтому не может класть файлы в существующую incoming. Бинарника rclone на ноутбуке нет |
| Облачный service account `GDRIVE_SA_JSON` | на ноутбук не переносился. По документации он только читает incoming и пишет служебный журнал |
| gcloud / ADC / Google Drive для компьютера | не установлены |
| Python | не установлен (есть только заглушка Microsoft Store). Поэтому загрузчик написан на Node 24, который уже стоит |

**Вывод на момент подготовки:** рабочей авторизации для записи в incoming не было.

**Обновление 2026-10-12:** владелец выполнил вход (`auth`, scope drive, токен под DPAPI вне Git). `check-auth`: `incomingVisible=true`, `incomingWritable=true`. Файлы не загружались, автозапуск не включён.

`auth` запускает установленный OAuth-поток (loopback 127.0.0.1 + PKCE) со scope `https://www.googleapis.com/auth/drive`. По умолчанию берётся client_id/secret из локального `rclone.conf` (только они, токен rclone не используется). Можно передать свой Desktop-клиент: `--client client.json`. Refresh-токен шифруется Windows DPAPI (CurrentUser) в `%LOCALAPPDATA%\RomanReels\source-uploader\oauth-token.dpapi`, вне Git. Токены и секреты в консоль и журнал не выводятся.

Риски:
- scope `drive` широкий (весь Drive владельца). Загрузчик сам ограничен incoming и заданием, но токен даёт больше.
- Если OAuth-клиент в режиме Testing, Google выдаёт refresh-токен примерно на 7 дней. Тогда нужен повторный `auth` или публикация клиента. Это не проверено.
- Если согласие на `drive` для этого клиента не разрешено, `auth` вернёт отказ. Тогда нужен свой Desktop-клиент (`--client`).

## Задание

Один JSON = один MP4 = одна роль. Схема `schemas/source-upload-job-v1.schema.json`, пример `examples/source-upload-job.example.json`. Задания кладутся в `%LOCALAPPDATA%\RomanReels\source-uploader\jobs\`.

```json
{"schemaVersion":"1.0.0","jobId":"ai-seo-audit-v2-hook1-20261012","topicId":"ai-seo-audit","scriptVersion":2,
 "role":"hook-1","localPath":"C:\\Users\\...\\Downloads\\Видео аватара.mp4","heygenTitle":"Видео аватара"}
```

- `role`: только `hook-1`, `hook-2`, `hook-3`, `body`. Тема и роль никогда не выводятся из имени файла или названия HeyGen.
- `heygenTitle` хранится только в локальном журнале. Рабочее имя в Drive — `<role>.mp4`.
- `textHash` необязателен и копируется только из проверенного задания. Загрузчик не вычисляет и не выдумывает тексты, хеши и утверждения. Лишние поля (например `approved`, `scriptText`) отклоняются.

## Что проверяется

1. **Готовность файла:** обычный файл (не ссылка), `.mp4`, рядом нет `*.crdownload|.partial|.part|.download|.tmp` того же имени. Размер и mtime стабильны в нескольких замерах, последняя запись старше 10 с. Ожидание ограничено 60 с, иначе `not_ready` до следующего прохода.
2. **Медиа:** `ffprobe` (контейнер MP4, ≥1 видео- и ≥1 аудиопоток, длительность) и **полное декодирование** `ffmpeg -xerror`. По умолчанию используются бинарники Remotion из `pv/node_modules`, иначе `ROMAN_FFPROBE`/`ROMAN_FFMPEG` или PATH.
3. **Неизменность:** SHA-256/MD5 считаются до проверки, повторно после неё и третий раз по потоку при отправке. Размер, mtime и inode сверяются до и после. Любое изменение → `manual_attention`, загрузка не завершается. Исходник открывается только на чтение и никогда не удаляется, не переносится и не переименовывается.
4. **Drive:** папки `<topicId>` и `v<N>` ищутся, а при отсутствии создаются с заранее зарезервированным ID (`files.generateIds`), записанным в журнал до запроса. Дубли или чужой тип с тем же именем → `ambiguous_folder`. Если `<role>.mp4` уже есть и не принадлежит этому заданию → `slot_occupied`, существующий файл не заменяется.
5. **Загрузка:** resumable upload с зарезервированным ID под временным именем `.<role>.mp4.uploading-<jobId>`. Затем сверяются фактический размер, `md5Checksum`, `sha256Checksum` (если Drive отдал), родитель и `appProperties` (`rrJobId`, `rrSha256`, …). Только после этого файл переименовывается в `<role>.mp4` и проверяется ещё раз. При несовпадении файл остаётся под временным именем (облачный приёмщик его не берёт) → `checksum_mismatch`.

## Журнал и восстановление

Локальный журнал `%LOCALAPPDATA%\RomanReels\source-uploader\journal-v1.json` (атомарная замена через временный файл) и лог `uploader-log.jsonl`. Облачный `intake-state-v1.json` не читается и не пишется. В журнале: jobId, тема, версия, роль, heygenTitle, путь, размер, SHA-256, MD5, длительность, ID папки и файла Drive, статус, попытки, код ошибки.

- **Повтор/перезапуск:** `uploaded` → файл в Drive перепроверяется по ID, повторной загрузки нет (`already_uploaded`).
- **Потеря ответа:** состояние остаётся `uploading`. Следующий проход сначала делает GET по зарезервированному ID и завершает работу с найденным файлом. Новый create отправляется, только если файла нет. Не больше 3 попыток, затем `manual_attention`.
- **Изменившийся исходник** после загрузки или между попытками не подменяет загруженный файл → `manual_attention`. Нужно новое задание с новым `jobId`.
- **Тот же jobId с другим содержимым** → `job_changed`. **Другой jobId на занятый слот** → `slot_taken_by_other_job`.
- Одновременно работает один процесс (`uploader.lock`). Зависший lock не снимается автоматически.
- `manual_attention` ждёт человека: разобраться, затем удалить запись из журнала или создать новое задание.

## Несовместимость с текущим приёмщиком

Облачный приёмщик сейчас требует **шесть частей и квитанцию**: `hook-1..3.mp4`, `body.mp4`, `ending-instagram.mp4`, `ending-tiktok.mp4`, `recording-set.json` (INCOMING_SIX_PARTS.md). Загрузчик первого этапа кладёт только три хука и основу. Поэтому приёмщик будет сообщать `waiting_for_parts` и перечислять окончания и квитанцию. Сводка прохода показывает это в `intake.<topic/vN>.missingForSixPartIntake`. Фиктивные окончания и квитанция **не создаются**. Квитанция требует textHash точных текстов из проверенного задания и формируется отдельно.

## Запуск

```powershell
cd <repo>\roman-reels
node scripts/run-source-uploader.mjs auth          # один раз, вход владельца в браузере
node scripts/run-source-uploader.mjs check-auth    # incomingVisible / incomingWritable, без секретов
node scripts/run-source-uploader.mjs validate <job.json>
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\run-source-uploader.ps1   # один ограниченный проход
```

Один проход обрабатывает не больше 20 заданий (`--max`), только из папки `jobs`. Личные папки и весь Drive не сканируются: читается лишь каталог самого MP4, чтобы найти незавершённую загрузку того же имени. Общий таймаут — 50 мин. Коды выхода: 0 — всё загружено, уже загружено, ещё не готово или отложено; 1 — нужна ручная проверка или ошибка задания; 2 — нет авторизации или доступа к incoming; 3 — таймаут. Ошибки дописываются в `runner-errors.log`.

Повторяемый запуск через Task Scheduler (**не включён**, применять только после согласования). Запуск только при выполненном входе пользователя, без хранения пароля, каждые 15 минут:

```powershell
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "<repo>\roman-reels\scripts\windows\run-source-uploader.ps1"'
$t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)
$s = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 55)
Register-ScheduledTask -TaskName 'RomanReels-SourceUploader' -Action $a -Trigger $t -Settings $s -User $env:USERNAME -RunLevel Limited
# откат: Unregister-ScheduledTask -TaskName 'RomanReels-SourceUploader' -Confirm:$false
```

Настройки питания, удалённого доступа и входа Windows не меняются.

## Тесты

`node --test roman-reels/scripts/source-uploader.test.mjs`: 13 тестов, fake Drive и fake токены, без Google, HeyGen и платных вызовов. Тесты добавлены в `roman-source-set-tests.yml`.

Покрыто:
- валидация задания без угадывания;
- путь до `uploaded`;
- незавершённое скачивание (соседний `.crdownload`, растущий файл, свежий mtime, отсутствующий файл);
- изменение во время проверки и во время отправки;
- повтор и перезапуск;
- потеря ответа после создания файла и папки;
- несовпадение контрольной суммы;
- отказ авторизации и недоступная для записи incoming;
- транспорт: однократное обновление токена при 401, отсутствие слепого повтора записи;
- занятый слот и изменённый после загрузки исходник;
- сохранность исходников;
- ограниченный проход и lock.

Реальная проверка медиа (валидный, мусорный, обрезанный, без звука MP4) нарезается stream copy из `pv/public/ai/h3.mp4` и пропускается без ffmpeg.

Локально (Windows, Node 24, ffmpeg Remotion): **13/13**; без ffmpeg 12 pass, 1 skip. Мутационная проверка: отключение поиска по зарезервированному ID, сверки удалённой суммы или проверки `.crdownload` роняет тесты.

## Не проверено и ограничения

- Реальная загрузка в Drive не выполнялась (авторизация есть, загрузка не разрешена на этом шаге).
- Реальный ответ Drive на create с уже существующим ID (ожидается 409, обрабатывается как «найти по ID») проверен только на fake.
- Ровно одно скачивание HeyGen → одно задание. Кто и как создаёт JSON задания (Telegram, worker, вручную), здесь не решается.
- Облачный приёмщик не примет комплект без окончаний и квитанции (см. выше).
