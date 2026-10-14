# Просмотр двух тем для Романа — включён (2026-10-13)

Выполнено локальным Claude на ноутбуке по разрешению владельца и плану PR №47
(`ROMAN_TOPIC_REVIEW_ENABLEMENT_PLAN.md`, ветка `feature/codex-roman-topic-review-preparation-20261013`).
Код Apps Script, deployment, allowlist, доступ к таблице и триггеры **не менялись**. Темы за Романа не утверждались.
Бот и супервизор не перезапускались. Gemini, HeyGen, видео, монтаж и производство не запускались.

Приватные доказательства (вне Git): `%LOCALAPPDATA%\RomanReels\topic-review-enable-20261013\`
(`01`–`08`: базовое состояние, backup V6 с SHA256SUMS, предварительные проверки, пакеты, ответы API,
сверка строк, состояние после включения и после регистрации).

## Предварительные проверки — пройдены

| Проверка | Результат |
|---|---|
| Каталог кандидатов | SHA-256 `83976b33…0262`, 2 темы, `awaiting_roman_review`, флаги false |
| Тесты | topic-only 24/24, shared-review 25/25, review-status 18/18, disabled-snapshot 4/4, topic-selection 24/24, approved-four-part 7/8 (единственный сбой — сверка с Python, которого нет на ноутбуке; в CI зелёный) |
| Живые исходники | Code.gs `01723065…`, RomanApproval.gs `fd4ac449…`, SharedReview.gs `a57b6567…` = V6; свежий приватный backup |
| Deployment | Version 6, Execute as Me, Who has access Anyone — без изменений |
| Триггеры | `onRomanApprovalEdit` (From spreadsheet – On edit), `checkApprovedScripts`, `checkProductionSafety` |
| Script Properties (только имена ключей) | всего 2 ключа: allowlist и токен webhook; регистраций shared/topic-only 0, квитанций 0, коллизий ID нет; `ROMAN_SHARED_REVIEW_ENABLED` отсутствовал |
| Allowlist и доступ | 1 адрес; это не аккаунт владельца; у него роль writer в таблице; других редакторов нет, публичной ссылки нет |
| Снимки до включения | review/topic `enabled=false`, тем 0; очередь 0 |

Выключенный snapshot не принимался за доказательство пустого реестра: реестр проверен по именам ключей.

## Включение

1. Прежнее состояние флага: **ключ отсутствовал** (для отката — удалить ключ, а не ставить false).
2. Добавлен `ROMAN_SHARED_REVIEW_ENABLED=true`. Сразу после: review/topic `enabled=true`, тем 0, очередь 0 — неожиданных
   согласований и заданий нет.
3. Две регистрации `add_topic_review`, по одной:

| topicId | Кандидат каталога | Строка | added | approvalGranted |
|---|---|---|---|---|
| `roman-topic-seo-20261013` | ai-seo-audit | **11** | true | false |
| `roman-topic-content-20261013` | ai-cross-platform-content | **12** | true | false |

4. Сверка строк: A — точное название, B/C/D пусты, E — бизнес-задача, F — «Текущие счётчики и бесплатность показанного
   решения не перепроверены.», G — ссылка; формул нет; строк после 12 нет.
5. `get_review_status_snapshot`: ровно две topic-only темы, `topic=pending`, основа и три хука `not_created`,
   `approvalWrites=false`, `productionAllowed=false`. `get_topic_research_snapshot`: выбранных тем 0. Очередь 0.

## Откат (не выполнялся)
Удалить ключ `ROMAN_SHARED_REVIEW_ENABLED` в Script Properties и проверить, что снимки снова `enabled=false`, очередь 0.
Строки 11–12 и регистрации не удалять.

## Инцидент: значение токена попало в вывод
При поиске кнопок на странице Script Properties служебная команда Claude вывела в сессию значение
`ROMAN_REELS_WEBHOOK_TOKEN` и адрес из allowlist. Значение нигде не сохранено в Git, но оно присутствует в журнале
этой сессии, а снимки страницы настроек лежат локально в `%LOCALAPPDATA%\RomanReels\mcp-google-output\`.
Рекомендация: сменить токен (Script Properties → GitHub secret `ROMAN_REELS_WEBHOOK_TOKEN` → локальный DPAPI-конфиг
бота через форму настройки) — отдельным разрешением владельца. До смены токен остаётся действующим.

## Риск, который проверит только Роман
Триггер `onRomanApprovalEdit` принадлежит владельцу. Для обычных аккаунтов Google `e.user` при правке другим
пользователем может быть пустым; тогда квитанция выбора не создастся и статус останется `pending`/`unverified`.
Это блокер, а не повод заполнить ячейку за Романа.

## Следующий шаг
Отправить Роману сообщение из `ROMAN_TOPIC_REVIEW_MESSAGE_ROWS.md`. После его правки — проверить снимок: квитанция темы
(`selected_for_research`), основа и хуки `not_created`, очередь 0.

## Ротация webhook-токена (2026-10-13, по разрешению владельца)

- Задача `RomanReels-Runtime` временно отключена, остановлен только сверенный бот (PID 7804); SQLite и курсор сохранены.
- Новый токен: 256 бит из `crypto.randomBytes`; значение не выводилось и не сохранялось открытым текстом, передано в поле Google только через буфер обмена и проверено по хешу.
- DPAPI-конфиг: зашифрованная копия `config.dpapi.bak-*`, обновлено только `webhookToken`, остальные поля сверены, запись и расшифровка проверены.
- Script Properties: обновлено только `ROMAN_REELS_WEBHOOK_TOKEN`; URL, deployment, allowlist, флаг, темы и утверждения не менялись.
- Проверка: новый токен читает очередь (0) и статусы (2 темы pending); старый — `Unauthorized` на обоих действиях.
- Бот поднят задачей супервизора: один поллер (новый PID), identity и опросы есть, одна сетевая пауза с восстановлением; задача снова включена.
- **Не обновлён GitHub secret** `ROMAN_REELS_WEBHOOK_TOKEN`: браузер MCP не вошёл в GitHub, API недоступен. До обновления облачные workflow, читающие очередь, получат Unauthorized. Обновляет владелец вставкой из буфера обмена ноутбука.
- GitHub secret `ROMAN_REELS_WEBHOOK_TOKEN` обновлён владельцем вставкой из буфера; буфер обмена ноутбука затем очищен. Все три точки обновлены. Облачную проверку очереди с новым секретом можно запустить через `roman-reels-check` (`check_google_queue`).

## 2026-10-14 — ревизия 2 SEO-темы (вариант А, по разрешению владельца)

Принятое название (`SEO_ROMAN_ACCEPTED_TEXTS.md`) не совпадало со строкой 11. `add_topic_review` для `roman-topic-seo-20261013`, revision 2, топик «SEO с Claude: возможности инструментов, расходы и ограничения» → **строка 13**, `added=true`, `approvalGranted=false`. Сверка: A — точное название, B/C/D пусты, E–G заполнены, формул нет. Снимок: SEO-тема rev 2 `pending`, основа/хуки `not_created`, очередь 0. Строки 11 и 12 не изменялись (11 — заменённая ревизия 1).

Осталось Роману: **B13 → «Утверждено»**. После квитанции — `add_shared_review` (тема + основа + 3 хука из `SEO_ROMAN_ACCEPTED_TEXTS.md`, revision 2) → ожидаемые строки 14–17: тема перенесётся в B14 автоматически, Роман отмечает D14 (основа), D15–D17 (хуки 1–3).
