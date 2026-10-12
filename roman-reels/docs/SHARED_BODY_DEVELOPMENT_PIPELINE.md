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
