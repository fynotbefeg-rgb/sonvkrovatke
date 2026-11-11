# Windows: кандидат выбора темы до сценария — результат

2026-10-12. Задание WINDOWS_TOPIC_FIRST_CANDIDATE.md (origin/feature/codex-pipeline `e14c1a5`). Выполнено локально на Windows. **В Google ничего не сохранялось и не развёртывалось.** Флаг не включался, строки не добавлялись, существующие approvals не переносились. Script Properties не открывались.

## Итог

Кандидат собран и проверен локально: все обязательные наборы и новые регрессии «Version 4 → кандидат» проходят. Установка не выполнялась. Ниже приведён план.

## 1. Приватный backup живого Version 4

Снят через `playwright-google` (только чтение редактора). Сохранён в LOCALAPPDATA/RomanReels/apps-script-backup/20261012-124829-v4. Прежняя копия 20261012-102258 сохранена без изменений.

| Файл (порядок проекта) | SHA256 | Ожидание задания |
|---|---|---|
| Code.gs | `01723065194af3c2f26d09101da388575b3a12611a1e61de58e6d440ee6fa16b` | совпадает |
| RomanApproval.gs | `9f18a05e6435031d0120508aba77678ffce469040a045bd0b4051cf24a30961e` | совпадает |
| SharedReview.gs | `0255877adb3656df93e23414b18cc95e407c417ddc9afc8358851d3035481776` | совпадает |

Расхождений нет.

## 2. Кандидат (вне Git)

LOCALAPPDATA/RomanReels/apps-script-candidate/20261012-124850-topic-first. Там файлы с LF, `SHA256SUMS` и `diff/` с полным diff против backup V4.

| Файл | Источник | SHA256 (LF) |
|---|---|---|
| Code.gs | живой V4, **без изменений** | `01723065194af3c2f26d09101da388575b3a12611a1e61de58e6d440ee6fa16b` |
| RomanApproval.gs | generated, `roman-reels/apps-script/RomanApproval.gs` @ `e14c1a5` | `84d8d59f7b2d7e2bc31d799a76d106d24d081a00950b1512d25091f031cb1e73` |
| SharedReview.gs | `roman-reels/apps-script/SharedReview.gs` @ `e14c1a5` | `a1d441bac0734f0eb602fd8252186cc88e49e1de9bf3c126dabf0432fe3e1094` |

`build-approval-addon.mjs` воспроизводит RomanApproval.gs из Code.gs репозитория; отличаются только переводы строк. Изменения в репозиторном Code.gs попадают в живой проект только через дополнение, а сам живой Code.gs не меняется.

### Что меняется относительно V4 (код репозитория, публичный)

- **RomanApproval.gs** (6 строк diff): `add_shared_review` передаёт список утверждающих в `register`. Новая ветка `add_topic_review` вызывает `RomanSharedReview.registerTopic`. Остальной маршрутизатор, токен, legacy очередь и edit-путь не меняются.
- **SharedReview.gs** (122 строки diff), всё новое находится под `ROMAN_SHARED_REVIEW_ENABLED`:
  - `validateTopic`, `topicConfigs`, `registerTopic` (одна строка из семи колонок, лимит 8000 байт, не более 90 регистраций) и `editTopics` (выбор только одиночным edit в столбце B от утверждающего);
  - snapshot включает topic-only темы;
  - `register` для темы с topic-only регистрацией требует живую квитанцию той же ревизии и текста и переносит **только** эту исходную квитанцию;
  - `queue` исключает legacy-варианты темы, управляемой как topic-only, и блокирует speech, если исходная тема отозвана.
- При выключенном флаге: `registerTopic` отклоняется, snapshot возвращает `enabled:false, topics:[]` в контракте V4, legacy очередь фильтруется как раньше.

## 3. Тесты (Node 24, локально)

Все данные, аккаунты и edit-события — **моки**. Они не подтверждают реальное поведение `e.user` в Google.

| Набор | Результат |
|---|---|
| apps-script.test.mjs | 10/10 |
| shared-review.test.mjs | 25/25 (включая 10 импортированных) |
| topic-only-review.test.mjs | 24/24 (включая 10 импортированных) |
| topic-selection-reader.test.mjs | 24/24 (включая 10 импортированных) |
| disabled-topic-snapshot.test.mjs | 4/4 |
| **apps-script-topic-first-candidate.test.mjs** (новый, с env-путями к backup V4 и кандидату) | 18/18 (8 новых + 10 импортированных) |
| тот же без env | 10 pass, 8 skipped |

Новые регрессии загружают **оба** проекта (V4 из backup и кандидат) в порядке Code.gs → RomanApproval.gs → SharedReview.gs:

1. Те же глобальные обработчики и один маршрутизатор. Функции legacy Code.gs побайтно совпадают, поэтому таймеры работают как прежде.
2. Загрузка не добавляет триггеров и ничего не пишет.
3. Неверный токен и неизвестный action дают ответы, идентичные V4.
4. Флаг выключен: snapshot без `capturedAt` идентичен V4 (`enabled:false`, пустые темы, `productionAllowed:false`). `add_topic_review` ничего не пишет; в V4 этот action возвращает `Unknown action`.
5. Legacy утверждённая очередь и `add_drafts` сохраняют контракт V4.
6. Состояние таблицы и свойств, созданное кодом V4 (shared packet с утверждениями), после замены кода даёт ту же очередь и тот же snapshot.
7. Переход: тема выбрана; speech с другим текстом или ревизией отклоняется; speech той же ревизии принимается. Переносится только исходная квитанция темы (hash, approvedBy, approvedAt совпадают). Очередь пуста, пока нет отдельных утверждений основы и хука; после них появляется только утверждённый хук. Отзыв исходной темы обнуляет очередь и snapshot.
8. Существующая full-shared тема не переводится в topic-only.

Мутационная проверка (не сохраняется): «кандидат = V4» роняет тест перехода; повторная простановка `approvedAt` при переносе квитанции тоже его роняет.

## 4. План установки (только после отдельного согласования)

1. Снять свежие SHA256 трёх живых файлов. Они должны совпасть с таблицей раздела 1, иначе остановиться.
2. Code.gs не трогать. Заменить содержимое RomanApproval.gs на `84d8d59f…`, затем SharedReview.gs на `a1d441ba…`. После перезагрузки редактора сверить хеши.
3. Script Properties, токен, утверждающих, квитанции, флаг (`ROMAN_SHARED_REVIEW_ENABLED` остаётся не заданным) и триггеры не менять. `setupRomanApproval` не запускать.
4. Manage deployments → Edit существующего Web app → New version (ожидается Version 5) → Deploy. Execute as, Who has access и URL оставить прежними; новый deployment не создавать.
5. Проверка: `roman-reels-check` с одним `check_google_queue` на feature/codex-pipeline. Ожидается прежняя очередь и `Topic snapshot check passed: enabled=false, topics=0`.

**Откат:** Manage deployments → Edit → Version 4 → Deploy (URL сохранится). При необходимости вернуть RomanApproval.gs и SharedReview.gs из backup 20261012-124829-v4. Code.gs, свойства и триггеры не меняются.

## Границы и риски

- Не проверено вживую: реальный `e.user` при выборе темы, поведение в таблице, квоты Script Properties. Для теста с настоящим `e.user` нужен разрешённый редактор (Роман), программный `setValue` его не заменяет.
- `queue()` в кандидате читает реестр topic-only даже при выключенном флаге. Повреждённая запись `ROMAN_TOPIC_ONLY_REVIEW:*` остановит и legacy очередь (fail-closed). То же уже верно для `ROMAN_SHARED_REVIEW:*` в V4. Сейчас таких записей нет.
- Независимое версионирование темы и речи не реализовано: для новой ревизии сценария нужна новая ревизия темы.
- Подготовка не означает готовности платного research / Apify / Gemini / HeyGen worker и production end-to-end. Тема Романом не выбрана.
