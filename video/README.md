# Рилсы «Сон без укачивания»

Вертикальные ролики (1080×1920, 30 fps) на [Remotion](https://www.remotion.dev/) в цветах и шрифтах лендинга.

## Ролики

- `SleepReel`: 15 секунд. Хук «Он засыпает только на руках?», вечер по часам, перелом «Он не перерастёт сам» и призыв забрать памятку.

Тексты, цвета и тайминги сцен лежат в `src/Composition.tsx`, длительность и размер кадра задаются в `src/Root.tsx`.

## Запуск

```bash
cd video
npm install
npm run dev      # Remotion Studio: предпросмотр в браузере
npm run render   # out/son-bez-ukachivaniya-reel.mp4
```

В облачной сессии Claude Code добавьте к рендеру уже установленный Chromium:

```bash
npm run render -- --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

Шрифты Literata и Golos Text (кириллица и латиница) лежат локально в `public/fonts`, поэтому интернет для рендера не нужен.
