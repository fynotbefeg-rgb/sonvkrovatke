# Incoming sources

Локальная папка входящих видео. MP4 и runtime manifests игнорируются Git.
В Drive incoming создана: `1Qs3YJQB9Hr8H7B0Fa7MWlwsQ0LLGBPoQ` внутри roman-reels-assets.
Автоматическое скачивание и доступ сервисного аккаунта ещё не подключены.
Эту папку не путать с finished Drive.

Текущая модель v2: hook-1.mp4, hook-2.mp4, hook-3.mp4, body.mp4,
ending-instagram.mp4, ending-tiktok.mp4 и recording-set.json в <topicId>/v<revision>/.
Приёмщик проверяет квитанцию, тексты/SHA/ревизию и media, затем сборка создаёт 6 вариантов.
См. docs/INCOMING_SIX_PARTS.md. Голосовые записи WAV/M4A пока не заменяют MP4 аватара.

Старая модель v1: один набор темы = hook-1.mp4, hook-2.mp4, hook-3.mp4 и body.mp4.
Части связываются source-set manifest по путям/SHA-256, не только по именам.
assemble-source-set.py создаёт три самостоятельных цельных источника для анализа речи и монтажа.
Допустим также ранее поддержанный цельный вход. См. docs/SHARED_BODY_ASSEMBLY.md.

Это source assembly, не production approval и не профессиональный финальный монтаж.
