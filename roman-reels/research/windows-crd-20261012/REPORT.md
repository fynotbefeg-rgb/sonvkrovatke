# Chrome Remote Desktop для постоянного доступа с iPhone, 2026-10-12

Запрос владельца: подготовить Chrome Remote Desktop (CRD) для доступа без человека у ноутбука; официальные установщики; RustDesk, Edge и MCP сохранить; в Google самому не входить; проверить официальный способ авторизации владельца с iPhone без передачи пароля через RustDesk.

## Итог: хост установлен, ждёт авторизации владельца

| Шаг | Статус | Наблюдение |
|---|---|---|
| CRD был установлен? | нет | папок и службы `chromoting` не было |
| Установщик | PASS | официальный `https://dl.google.com/edgedl/chrome-remote-desktop/chromeremotedesktophost.msi`, 24 449 024 байт, SHA-256 `c7f6fb29bb6da0ddad9a847e4a4c353ab20b255d1a6ab60978285673dc57d10b` |
| Подпись | PASS | Authenticode Valid, `CN=Google LLC`, издатель DigiCert Trusted G4 Code Signing RSA4096 SHA384 2021 CA1; повторно проверена в установочном скрипте перед запуском |
| Установка | PASS | `msiexec /qn /norestart` с правами администратора, код 0; UAC повысил права без окна; версия хоста 154.0.8037.40 |
| Служба `chromoting` | установлена | Stopped / Manual — ожидаемо до регистрации хоста; включится после авторизации |
| `remoting_start_host.exe` | есть | `Program Files (x86)\Google\Chrome Remote Desktop\CurrentVersion\` |
| Вход в Google | не выполнялся | страница `remotedesktop.google.com/headless` существует и при открытии перенаправляет на вход Google («Вход – Google Аккаунты»); дальше не шёл |
| RustDesk, Edge google-project, MCP | работают | не останавливались |

## Официальный способ авторизации без входа на ноутбуке

Это штатный «headless»-способ Google для компьютеров без браузера (Linux/Windows):

1. Владелец на iPhone открывает `https://remotedesktop.google.com/headless`, входит в свой Google-аккаунт на телефоне (пароль и 2FA вводятся только на iPhone). Если сайт предупреждает о браузере — «Continue Anyway».
2. Нажимает Begin → Next → Authorize. Google показывает однократную команду для Windows вида `"%PROGRAMFILES(X86)%\Google\Chrome Remote Desktop\CurrentVersion\remoting_start_host.exe" --code="…" --redirect-url="https://remotedesktop.google.com/_/oauthredirect" --name=%COMPUTERNAME%`.
3. Команда содержит одноразовый код авторизации (не пароль Google), который действует несколько минут. Владелец передаёт её Claude в личном чате; Claude выполняет её на ноутбуке, добавив случайный PIN (не менее 6 цифр), и передаёт PIN только в личном чате.
4. После регистрации ноутбук появляется в приложении Chrome Remote Desktop на iPhone под тем же аккаунтом; вход — по PIN.

Ограничения проверки: сама страница headless после входа и вид команды не проверены (вход не выполнялся); то, что этот поток полностью проходит в Safari на iPhone, не подтверждено. Код и PIN в Git и отчёты не попадают. CRD — бесплатная служба Google без платных тарифов; условия коммерческого использования отдельно не проверялись.

## Регистрация хоста, 2026-10-12

- Владелец прошёл авторизацию на iPhone и передал одноразовую команду в личном чате.
- `remoting_start_host.exe` выполнен с правами администратора (UAC без окна) с кодом владельца и случайным PIN из 8 цифр; код и PIN в отчёт и журналы не записаны, в выводе скрыты.
- Результат: код выхода 0, «Host started successfully.» Служба `chromoting` Running / Automatic — переживёт перезагрузку.
- Информационное сообщение `host_unprivileged.json does not exist, skipping read` — штатное для первой регистрации.
- RustDesk и MCP работают, Edge не трогался.
- Подключение с iPhone в приложении Chrome Remote Desktop пока NOT_TESTED — проверяет владелец.

## Приложение на iPhone, 2026-10-12

Владелец не нашёл приложение Chrome Remote Desktop в App Store. Проверка через публичный iTunes Search API (регионы US и RU, запрос «chrome remote desktop»): отдельного приложения Chrome Remote Desktop от Google LLC в выдаче нет — есть только Google Chrome, AnyDesk, Windows App Mobile и другие. Поиск по прежнему id 944025852 возвращает 0 результатов в обоих регионах. Вывод: нативного iOS-приложения CRD в App Store сейчас нет (или оно недоступно через этот API).

Оставшийся путь для CRD — веб-клиент `https://remotedesktop.google.com/access` в браузере iPhone под тем же аккаунтом Google. Работа веб-клиента на iOS не проверена.

Для сравнения: RustDesk Remote Desktop (Purslane Limited, бесплатно) в российском App Store есть; служба RustDesk на ноутбуке работает.
