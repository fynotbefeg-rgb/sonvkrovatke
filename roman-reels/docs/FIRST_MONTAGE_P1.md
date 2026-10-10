# P1 — результаты Codex, 2026-10-10

Владелец согласовал контракт v1 и технический P1 после PR #5.
Статус: **данные и интеграция подготовлены; Claude engine и новый смонтированный MP4 отсутствуют**.
Ветка feature/codex-pipeline, PR в automation, main не меняется.

## Доказанное состояние

- Исходник `pv/public/ai/body1.mp4`: SHA из AUDIT_V3, 33.720 с, 1080×1920/25fps/H.264/AAC.
- Две реальные ASR попытки faster-whisper small на CPU int8 дали 81 слово. В обеих предлог «в»
  имел нулевую длительность. Обе отклонены interval validator; timestamps не интерполировались.
- Вторая попытка: VAD off, словарная подсказка Claude/Telegram/WhatsApp. Это подсказка ASR,
  а не подмена текста озвучивания. Оригинальные распознавания сохранены в research.
- Первый проблемный сегмент (23 слова) выровнен заново Wav2Vec2 CTC по настоящему аудио;
  остальные слова используют Whisper timestamps. Все 81 интервал теперь структурно корректны.
  Это гибридное выравнивание, **не полный WhisperX и не гарантия правильного распознавания**.
- `research/first-montage-v1/development-job.json` проходит schema и semantic validator.
  mode development, approval pending_approval. ScriptText — результат ASR;
  hookText — техническая подпись первых слов body, не утверждённый хук.
- `source-technical-qc.json`: полный decode исходника, resolution/audio/duration/fps/codecs проходят.
  Это проверка исходника, не результат нового Remotion-рендера.
- Интеграционный wrapper требует Claude `pv/src/factory/director.ts` + composition `RomanFactoryV1`.
  На реальном job корректно блокируется до создания выходной папки, так как engine не получен.
  Нет нового MP4, публикации, Drive upload или Sheets ready.

## Измерения и зависимости

Среда: 3 доступных CPU, 9968 MiB памяти; GPU не использован.
ASR второй попытки: wall 34.885 с, peak RSS около 823 MiB, intervals invalid.
CTC: wall 8.360 с, peak RSS около 1636 MiB, intervals valid.
Это разные процессы с локальными весами, не бенчмарк полного pipeline/90 роликов в месяц.
Файлы двух моделей занимают около 1.75 GB; первичная загрузка не включена в эти времена.
Платные API/Actors и HeyGen не вызваны.

Модели и лицензии проверены по официальным карточкам:
[Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small), MIT,
revision `536b0662742c02347bc0e980a01041f333bce120`;
[wav2vec2-large-xlsr-53-russian](https://huggingface.co/jonatasgrosman/wav2vec2-large-xlsr-53-russian),
Apache-2.0, revision `2329100508896c6d9b157019803ab5601e6f3406`.
SHA весов/config, параметры и версии записаны в speech evidence.
CTC aliases Telegram→телеграм / WhatsApp→ватсап используются только для alignment labels,
отображаемый transcript не менялся. Неизвестные слова/цифры не удаляются молча.

PyAV 19 несовместим с faster-whisper 1.2.1; проверена версия 16.1.0.
Выравнивание использует plain Wav2Vec2Processor, а не optional LM decoder.
[TorchAudio 2.8](https://docs.pytorch.org/audio/2.8/tutorials/forced_alignment_for_multilingual_data_tutorial.html)
помечает forced_align deprecated; API удалён в 2.9. Это отдельный pinned эксперимент:
перед production потребуется поддерживаемый aligner, не обновлять torchaudio вслепую.
ASR evidence выполнен с tokenizers 0.23.3; CTC окружение требует совместимую с transformers 0.22.2.
Повторный ASR с новым tokenizer отдельно не измерялся; точные версии обеих попыток сохранены.
Для точного воспроизведения ASR использовать отдельный venv с версиями из evidence.

## Повторяемые команды из корня repo

Подготовить Python venv и requirements-speech.txt; при CTC — CPU torch/torchaudio и
requirements-alignment.txt по инструкции в файле. Модели загрузить по указанным revisions через
обычный разрешённый proxy; не хранить веса в Git. Скрипты читают только уже локальные веса.

```sh
/workspace/roman-speech-venv/bin/python roman-reels/scripts/transcribe-development-source.py \
  --source ai/body1.mp4 --model-path /workspace/roman-whisper-small \
  --model-revision 536b0662742c02347bc0e980a01041f333bce120 \
  --out /workspace/scratch/new-speech --disable-vad --vocabulary 'Claude, Telegram, WhatsApp.'
# Если raw ASR intervals invalid, предыдущая команда вернёт nonzero, сохранив speech.json.
/workspace/roman-speech-venv/bin/python roman-reels/scripts/realign-development-speech.py \
  /workspace/scratch/new-speech/speech.json --model-path /workspace/roman-ctc-russian \
  --out /workspace/scratch/new-speech/aligned.json
python roman-reels/scripts/prepare-development-job.py \
  /workspace/scratch/new-speech/aligned.json /workspace/scratch/new-speech/job.json
python roman-reels/scripts/validate-factory-job.py /workspace/scratch/new-speech/job.json
python roman-reels/scripts/run-development-montage.py \
  /workspace/scratch/new-speech/job.json --out /workspace/scratch/new-montage
```

Последняя команда пока ожидаемо blocked. Даже после technical QC нет qc_passed:
остаются speech/plan/assets/subtitle geometry/visual review и production trusted approval.

## Проверки и следующая зависимость

7 media/integration тестов проходят: настоящий FFmpeg fixture, missing audio/corruption,
wrong duration/fps, traversal/symlink, invalid intervals без мутации, checksum/metadata mismatch,
no-engine→no-render, pronunciation labels без потери неподдерживаемых токенов.
6 contract и 2 обновлённых Claude packet tests проходят; pip check и Python compile чистые.
Другие 43 существующих offline tests прошли в предыдущем аудите; их код здесь не менялся.
8 прежних TS ошибок остаются задачей Claude; новых TS компонентов Codex не писал.

Конкретный заказ [CLAUDE_P1_EXECUTION.md](CLAUDE_P1_EXECUTION.md) автоматически собирается
prepare-claude-job.mjs в proposal-only packet; локальный пакет создан, Claude не запущен.
Чтение GitHub repository vars вернуло HTTP 403 Resource not accessible by integration:
доступ к коду есть, к этим настройкам — нет. Это не доказательство отсутствия Secret.
Наличие облачного авторизованного Claude и передача заказа ещё не проверены.
Не заменять отсутствующее подключение платным API и не переносить workflow в main.
