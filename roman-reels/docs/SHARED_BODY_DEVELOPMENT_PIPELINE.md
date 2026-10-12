# Один запуск: четыре части → монтажный пример

`run-shared-body-development.py` соединяет существующие assembler,
prepare-assembled-jobs, Claude Director/RomanFactoryV1 и обёртку с сохранением
исходной AAC-дорожки. Компоненты Claude не переписаны. Только development,
без Google/HeyGen/утверждений/публикации/paid API.

Вход — source-set v1 и четыре speech.json, ранее полученных из реального
аудио. Обязательны совпадающие пути/SHA/metadata, допустимые слова и интервалы.
Тайминги основы сдвигаются по проверенной карте сборки; хук не добавляется
второй раз. Распознавание заново НЕ запускается и утверждения не создаются.

```text
python roman-reels/scripts/run-shared-body-development.py \
  roman-reels/research/first-montage-v1/source-set.json \
  --body-speech roman-reels/research/first-montage-v1/aligned-speech.json \
  --hook-speech roman-reels/research/first-montage-v1/hooks/h1/speech.json \
    roman-reels/research/first-montage-v1/hooks/h2/speech.json \
    roman-reels/research/first-montage-v1/hooks/h3/speech.json \
  --public-directory rr/incoming/NEW-DEVELOPMENT-RUN \
  --out /tmp/NEW-MONTAGE-RUN --browser-executable /usr/bin/chromium
```

Требуются Python/FFmpeg/ffprobe/Node, `npm ci` в pv и доступный локальный
Chromium. Новые каталоги обязательны, существующие не перезаписываются.
Файлы исходников не удаляются. По умолчанию рендерятся все три варианта;
`--render-hooks 1` ограничивает контрольный запуск одним вариантом.

Создаются три source assembly и три job/speech sidecar, а рендеры только
для запрошенных хуков. pipeline-report.json остаётся complete=false при
незавершённом/ошибочном запуске; allThreeRendered=true только если получены
все три. Complete относится к запрошенному техническому прогону, не готовности
видеостудии или права на производство. Rendered-job остаётся development,
pending_approval/rendered, не qc_passed; нужна проверка слов/визуального качества.

Четыре автономных теста используют настоящие синтетические MP4 и mock renderer:
отдельные jobs и тайминги, partial failure без complete, запрет production/
неверных хуков и несвязанный speech cache до создания артефактов. Это не
доказательство фактического Remotion-рендера, который проверяется отдельно.

Связь с живым Drive приёмщиком/динамическими сценариями пока не включена.
Для новых записей без совпадающих speech caches нужен настоящий ASR;
нельзя подменить его интерполяцией текста или использовать чужие тайминги.

## Фактический контрольный запуск 2026-10-12

Одна CLI-команда на прежних реальных repository fixtures создала три сборки
40.24/41.52/38.48 с и три проверенных job со сдвигами слов из прежнего ASR/CTC
кеша. `--render-hooks 1`: полный Remotion h1 завершился, 1080×1920,25fps,H264/AAC,
40.24 с; decode/audio/duration/codec QC прошли. Сохранение исходного AAC подтвердило
идентичность всего decoded audio и clock (start0,duration40.24,sampleRate48000).
Новый ASR не выполнялся; h2/h3 профессиональные рендеры не выполнялись в этом запуске.

Результат: research/shared-body-development-run-20261012/result.json.
Один кадр на9с просмотрен: лицо/микрофон не перекрыты. Это не полный визуальный/
речевой review. MP4 и кадр находятся вне Git, в текущем облачном workspace.
Попытка передачи MP4 в private Drive/ChatGPT отклонена автоматической проверкой:
specific voice-containing payload/destination requires explicit owner approval.
Ничего не загружено; обхода/повторной передачи нет. Требуется отдельное разрешение
для этого конкретного файла/папки, если владелец хочет просмотр через Drive.
