# Слот outbox — проверка 2026-10-14 и план создания (не выполнен)

## Проверено (только чтение)
- Основной клон `feature/codex-pipeline` @ `ad34540`; супервизор `running`, один бот (PID 21944), не перезапускался.
- Есть `delivery-config.json`, `delivery-ack-config.json`, DPAPI-токен загрузчика; OAuth работает, incoming и `_windows-jobs`
  доступны для записи; почтовый ящик `empty`.
- **Нет:** слота `source-plan-outbox-v1.json` в `_windows-jobs` (0 файлов), локального `delivery-outbox-config.json`,
  каталога `%LOCALAPPDATA%\RomanReels\delivery-outbox`, repository variable `ROMAN_WINDOWS_OUTBOX_FILE_ID`.

## План (по разрешению владельца; так же создавался слот подтверждений)
1. OAuth загрузчика: в `_windows-jobs` найти `source-plan-outbox-v1.json`; если файлов больше одного или содержимое
   отличается от пустого маркера — остановиться. Если нет — создать **один** файл с заранее выданным ID и содержимым
   `{"outboxVersion":"1.0.0","status":"empty"}` (MIME `application/json`).
2. Проверить имя, MIME, родителя, содержимое/MD5; права не менять (сервисный аккаунт получает чтение по наследству от папки),
   публичного доступа нет. Убедиться, что ID отличается от ящика, папки и слота подтверждений.
3. Записать `{"fileId":"…"}` в `%LOCALAPPDATA%\RomanReels\source-uploader\delivery-outbox-config.json` (вне Git, без перезаписи).
4. Проверка без записи: `node scripts/push-windows-outbox.mjs` при пустом локальном outbox → `nothing_to_send`, слот не изменён.
5. Владелец: repository variable `ROMAN_WINDOWS_OUTBOX_FILE_ID` = ID слота (без перевода строки). Облачный релей не запускать
   до утверждённой Романом темы.

Вымышленным пакетам утверждения не назначаются. Workflow, Gemini, HeyGen, видео и производство не запускаются.

## Выполнено 2026-10-14 (по разрешению владельца)
Шаги 1–4: слотов не было, создан один `source-plan-outbox-v1.json` с пустым маркером; имя, MIME, родитель, содержимое/MD5 сверены; права: владелец + один читатель (наследуются), публичного доступа нет; ID отличается от ящика, папки и слота подтверждений. `delivery-outbox-config.json` записан вне Git. `push-windows-outbox.mjs` → `nothing_to_send`, слот остался пустым. Шаг 5 (repository variable) — за владельцем.
