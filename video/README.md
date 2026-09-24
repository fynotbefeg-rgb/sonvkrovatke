# Рилсы «Сон без укачивания»

Вертикальные ролики (1080×1920, 30 fps) на [Remotion](https://www.remotion.dev/) в цветах и шрифтах лендинга.

## Как устроено

- `src/reels.ts` — сценарии рилсов по плану `content/30-days.md`: каждый рилс — список сцен с текстом, длительностью и видеофоном.
- `src/Reel.tsx` — типы сцен: `hook` (хук по строкам), `timeline` (вечер по часам), `statement` (утверждение с подчёркиванием), `steps` (нумерованные шаги), `ladder` (лестница ступеней), `cta` (призыв с кнопкой).
- `src/theme.tsx` — цвета и шрифты сайта, общие анимации.
- `public/footage/` — видеофоны, источники в `FOOTAGE.md`.

Новый рилс — это новый ключ `DayNN` в `src/reels.ts`, код писать не нужно.

## Запуск

```bash
cd video
npm install
npm run dev      # Remotion Studio: предпросмотр в браузере
npm run render   # все рилсы в renders/weekN/dayNN.mp4
npm run render -- Day05   # только один
```

В облачной сессии Claude Code добавьте к рендеру уже установленный Chromium:

```bash
npm run render -- --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
```

Шрифты Literata и Golos Text (кириллица и латиница) лежат локально в `public/fonts`, поэтому интернет для рендера не нужен.
