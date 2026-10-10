# Incoming sources

Локальная папка входящих видео. MP4 и runtime manifests игнорируются Git.
В Drive отдельная incoming ещё не подключена; эту папку не путать с finished Drive.

Основная модель: один набор темы = hook-1.mp4, hook-2.mp4, hook-3.mp4 и body.mp4.
Части связываются source-set manifest по путям/SHA-256, не только по именам.
assemble-source-set.py создаёт три самостоятельных цельных источника для анализа речи и монтажа.
Допустим также ранее поддержанный цельный вход. См. docs/SHARED_BODY_ASSEMBLY.md.

Это source assembly, не production approval и не профессиональный финальный монтаж.
