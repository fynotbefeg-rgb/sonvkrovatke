# Claude — конкретный исполняемый заказ P1

Основание: владелец согласовал контракт v1 и P1 после PR #5 (2026-10-10).
Это согласование разработки, не production approval и не разрешение платного API.
Прочитать CLAUDE_TASKS, INTEGRATION_CONTRACT, CODEX_TASKS и текущий CODEX_HANDOFF.
Целевая feature-ветка `feature/claude-montage` от последней automation base; пакет предложения
можно подготовить на точном Codex PR HEAD без commit/push и отдать patch на проверку.
Не считать этот заказ выполненным без кода и проверок.

## Входы уже подготовлены Codex

`pv/public/ai/body1.mp4`: настоящее видео, 1080×1920, 25 fps, 33.720 с, речь и микрофон.
Это body-клип; не обещать полного нового сценария с хуком или прав production публикации.
В `research/first-montage-v1/` сохраняется реальное распознавание и его ограничения.
Использовать только development-job.json, прошедший проверку, если он существует;
не делать собственные fake words и не менять старые romanWords.json.
Ошибочные попытки распознавания не являются входом для рендера.

## Точный интерфейс интеграции

1. `pv/src/factory/director.ts`: export `buildMontagePlan(job)` → объект `{events: [...]}`
   из schema v1. Обычный чистый TypeScript с erasable types, без React/Remotion/CLI imports,
   чтобы Codex мог импортировать через Node `--experimental-strip-types`.
   Если есть импорты типов — `import type`; runtime локальные импорты — явные `.ts`.
2. Добавить композицию `RomanFactoryV1` в Root, принимающую весь job v1 как props.
   `calculateMetadata` считает frames=`ceil(duration*fps)`; сохраняются все старые композиции.
   Не требовать fake defaultProps: без проверенного job Studio показывает «Нет проверенного исходника».
3. Компонент использует `staticFile(job.sourceVideo.localPath)` и полную исходную речь,
   слова `text/start/end`, события montagePlan и renderSettings.safeZone. Никакого повторного хука/аудио.
4. Сначала subtitle highlight, один смысловой акцент (например, если он действительно есть в речи),
   ограниченные карточки/zoom. Входной visualAssets пуст; использовать собственную типографику/геометрию.
   Не придумывать интерфейс/скриншот инструмента. Условные b-roll/interface требуют assetId.
5. События покрывают wordStart..wordEnd и не выходят за длительность. Смена скорости запрещена.
   Лицо/микрофон в центре: не перекрывать смысловыми карточками, проверять stills.
6. Исправить 8 существующих ошибок TS, не удаляя композиции. Изменение npm scripts за пределами
   текущего restricted patch scope — сообщить Codex, он сделает отдельно после проверки.

Codex wrapper уже ожидает именно эти интерфейсы:
`python scripts/run-development-montage.py <development-job.json> --out <new-directory>`.
Если Director отсутствует, он останавливается до рендера. Нельзя снимать этот guard.
Нельзя утверждать, что источник/schema/текст гарантируют production approval.

## Проверки и сдача

Тесты чистых функций: границы слов/пауз, длинные русские слова, missing assets, неизвестная schema,
невалидные пути и интервалы, совпадение активного слова с кадром, повторяемость plan.
Команды, если в сеансе разрешён Bash: tsc, bundle, wrapper render и stills около акцента/конца.
Restricted headless packet не имеет Bash: написать код и список команд, проверит Codex.
Отдать patch/коммит, actual results, ограничения; не выдумывать successful render.
Не вызывать модель в каждом видео, не использовать paid APIs/HeyGen, не трогать очередь/Sheets/secrets.
