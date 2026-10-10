#!/usr/bin/env bash
# Вставки для темы mctiktok из записи экрана ManyChat (Роман, 576x1280, 91 с).
# Отрезки выбраны вручную: без App Store с рекламой и без личных заметок (0:52–1:12).
# Использование: cut-tiktok-clips.sh <запись.mp4> <папка public/ai>
set -euo pipefail
src="$1"; out="$2"
mkdir -p "$out"
cut() { # имя старт длительность высота_кропа
  ffmpeg -nostdin -v error -y -ss "$2" -t "$3" -i "$src" -an \
    -vf "crop=576:$4:0:0,scale=1080:-2,fps=25,format=yuv420p" \
    -c:v libx264 -crf 18 -preset veryfast "$out/$1.mp4"
}
cut tt_open  12.0 4.0 1280
cut tt_tpl   16.4 5.4 1280
cut tt_kw    28.0 5.0 740
cut tt_flow  38.2 6.6 1280
cut tt_paste 79.0 4.0 1280
cut tt_live  83.0 4.6 1280
ls -l "$out"/tt_*.mp4
