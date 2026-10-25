# Codex: проверка Claude PR #6

Проверяемый HEAD: `9eff02d38e41c32e7664ac200cd64723a89ea325`.
Base PR: `feature/codex-pipeline`; `main` не изменён.
Код Claude проверяется в отдельном detached worktree `/workspace/roman-review-6`.

## Повторная проверка: C1 устранено, PR объединён

Claude HEAD `f45e50ae85b70b1689c6b1c171983349e38d315a` независимо проверен Codex.
`timing.ts` сжимает fade до 80% длительности события; composition использует helper
для акцентов и zoom. Для floating-point collapse безопасно показывает без fade.
План Director, слова и тайминги не менялись; исходная audio-preservation правка сохранена.

Пройдено: tsc, 14 Director tests, 7 timing regression tests (исходный C1 repro
и все события трёх реальных заданий), Python 6 contract + 10 media + 4 assembled + 4 source-set.
GitHub check-runs у этого SHA нет; перечислены реальные локальные проверки, не CI.
PR #6 объединён в `feature/codex-pipeline`, merge commit `e1a7c310bb59d8d8fddbbdb2834d8d95116f918c`.
Слияние подтверждено GitHub API и локальным fast-forward. `main` и approvals не менялись.

После C1 полного повторного рендера Codex не запускал: поправлена только envelope-функция,
её реальные вызовы interpolate проверены регрессионными тестами, Director планы не менялись.
Обновлённый полный h1/zero-delay render подтверждён evidence Claude; прежний независимый h1
Codex с исправленным звуком сохранён. h2/h3 ещё не перерендерены после C1.
Художественная оценка, speech review и production approval остаются незавершёнными.

Ниже — первоначальное замечание и проверки до исправления, сохранённые как история.

## Блокирующее замечание C1: короткие акценты ломают рендер

`pv/src/factory/RomanFactoryV1.tsx`, envelope (строки 65–67) использует фиксированные
длины появления/исчезновения. Director законно сокращает хвост предыдущего акцента
перед следующим. Для короткого события массив времени становится не возрастающим,
и Remotion interpolate бросает исключение.

Воспроизводимый допустимый пример для pure Director:
duration=30, слова `Claude` [1, 1.1] и `Gemini` [1.11, 1.2].
Первый keyword event: start=0.92, end=1.1. Accent вызывает envelope с 0.22/0.25:
inputRange=[0.92, 1.14, 0.85, 1.1].
Remotion: `inputRange must be strictly monotonically increasing`.
Результат независимо воспроизведён Codex на версии Remotion 4.0.527.
Те же ограничения должны соблюдаться для zoom с fade 0.6/0.6.

Задание Claude: вычислять fade-времена из фактической положительной длины события,
оставляя строго возрастающие точки. Не менять речь, тайминги и исходники.
Вынести pure timing helper; добавить тесты короткого акцента, двух соседних терминов,
короткого zoom и события у конца видео, включая вызов Remotion interpolate.
Повторить 14 Director tests, tsc и контрольный development render.
Первоначальное требование: до исправления C1 PR не сливать. Выполнено при повторной проверке выше.

## Звук — исправление конвейера Codex

Для текущего P1 композиция воспроизводит полный источник без cuts/speed changes.
`preserve_source_audio.py` заменяет повторно закодированную Remotion дорожку
исходной AAC через stream copy. Это сохраняет аудио без второго lossy encode.
Проверки: SHA исходника, согласованная полная длительность, равенство декодированного
PCM всей дорожки, одинаковые start/duration/sampleRate с точностью до одного сэмпла.
Никакого подбора задержки «на глаз». Старый Remotion output сохраняется отдельно.
Выходные файлы не перезаписываются, при ошибке production delivery не происходит.
Этот способ не подходит будущему монтажу с нарезкой/изменением скорости;
для такого монтажа нужно согласовать новую аудиокарту.

Wrapper также принимает `--browser-executable` для уже установленного локального Chromium.
В этой среде загрузка Chrome автоматически не работает; установленный `/usr/bin/chromium`
запускается при разрешённом сетевом sandbox. Это ограничение среды, не ошибка Claude.

## Независимые проверки

- tsc --noEmit: без ошибок.
- Director: все 14 тестов прошли через `node --experimental-strip-types src/factory/director.test.ts`.
- Исходные Python suites PR: contract 6 + media 7 + assembled-jobs 4 + source-set 4 прошли.
- После исправления звука: media 10 прошли, включая искусственную задержку 43 мс,
  восстановление точного PCM/clock, no-overwrite, изменённый SHA и изменённую длительность видео.
- Приложенный Claude лист кадров h1 просмотрен: лицо/микрофон не перекрыты в этих кадрах.
  Это не автоматическая face detection и не визуальная проверка каждого кадра.

Полный независимый рендер h1 выполнен на Remotion 4.0.527 с Chromium 151, 1006 кадров.
Старый wrapper остановился при попытке скачать браузер, поэтому повтор выполнен теми же
CLI параметрами с явным `--browser-executable /usr/bin/chromium`; props построены wrapper.
Remotion MP4 и затем исправленный MP4 прошли technical QC.
В четырёх окнах на 1/10/25/35 с исходный рендер отстаёт на 0.042625 с
(8 kHz измерение, correlation 0.971–0.992). Исправленная дорожка имеет zero-lag correlation 1.0,
равный PCM SHA всей дорожки и source clock 0 / 40.24 с / 48 kHz.
Evidence: `research/first-montage-v1/codex-pr6-review/h1-render-check.json`.
Исправленный MP4: `/workspace/scratch/codex-pr6-h1/source-audio-fixed.mp4`, вне Git.
h2/h3 Codex заново не рендерил; их успех пока подтверждён только отчётом Claude.
Все артефакты development: нет утверждения Романа, публикации, Sheets/Drive записи,
платных вызовов или HeyGen. Три рендера Claude не заменяют независимую проверку Codex.
