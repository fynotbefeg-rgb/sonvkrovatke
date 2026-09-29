# Видеофоны

Файлы лежат в `public/footage/`, в сценах `src/reels.ts` на них ссылается поле `footage`.
Сцена без видеофона идёт на однотонном ночном фоне. Сверху на видео ложится тёмное затемнение, чтобы текст читался, поэтому годятся и светлые кадры.

## Что стоит сейчас

| Файл | Что в кадре | Источник |
|---|---|---|
| `stock-mom-holding-asleep.mp4` | Мама держит спящего малыша | [Pexels 7508616](https://www.pexels.com/video/7508616/) |
| `stock-asleep-by-crib.mp4` | Малыш спит на руках у кроватки | [Pexels 7509026](https://www.pexels.com/video/7509026/) |
| `stock-mom-rocking-crib.mp4` | Мама укачивает у пустой кроватки | [Pexels 7509023](https://www.pexels.com/video/7509023/) |
| `stock-putting-in-crib.mp4` | Мама кладёт малыша в кроватку без одеяла | [Pexels 7508453](https://www.pexels.com/video/7508453/) |
| `ai-bedroom-night.mp4` | Спальня ночью, людей нет (ИИ-кадр) | [Pixabay 371839](https://pixabay.com/videos/id-371839/) |
| `stock-hand-on-chest.mp4` | Ладонь мамы на груди спящего малыша | [Pexels 6391711](https://www.pexels.com/video/6391711/) |
| `stock-asleep-top-view.mp4` | Малыш спит на белой простыне, вид сверху | [Pexels 6392203](https://www.pexels.com/video/6392203/) |
| `stock-asleep-face.mp4` | Лицо спящего малыша крупно | [Pexels 6391720](https://www.pexels.com/video/6391720/) |
| `stock-lamp-book.mp4` | Ночник и книга, людей нет | [Pexels 7505914](https://www.pexels.com/video/7505914/) |
| `stock-holding-baby-hand.mp4` | Мама держит ручку спящего малыша | [Pexels 6391730](https://www.pexels.com/video/6391730/) |
| `stock-hands-closeup.mp4` | Руки мамы и малыша крупно | [Pexels 6392156](https://www.pexels.com/video/6392156/) |
| `stock-child-asleep-bed.mp4` | Ребёнок спит в кровати | [Pexels 7506000](https://www.pexels.com/video/7506000/) |
| `stock-phone-dark.mp4` | Свет телефона в тёмной спальне | [Pexels 7986754](https://www.pexels.com/video/7986754/) |
| `stock-baby-eyes-open.mp4` | Малыш открывает глаза | [Pexels 18130610](https://www.pexels.com/video/18130610/) |
| `stock-mom-reading.mp4` | Мама читает ребёнку | [Pexels 12761062](https://www.pexels.com/video/12761062/) |
| `stock-reading-fairy-lights.mp4` | Чтение на ночь, гирлянда | [Pexels 7394146](https://www.pexels.com/video/7394146/) |
| `stock-mom-phone-bed.mp4` | Мама в кровати с телефоном, ночь | [Pexels 7986737](https://www.pexels.com/video/7986737/) |

Первые четыре кадра — из одной серии: одна мама, малыш на вид 8–10 месяцев, кроватка без подушки и одеяла. Остальные подобраны так, чтобы у каждого рилса был свой фон. Кадры с кроваткой берём только без подушки, одеяла и игрушек. Клипы обрезаны до 6 секунд и уменьшены до 1080 px по ширине.

## Как искать замену

Формат: вертикальное видео 9:16 (1080×1920 или больше), от 3 до 6 секунд, без текста и логотипов. Звук не нужен.

| Файл | Сцена | Откуда |
|---|---|---|
| `stock-mom-rocking.mp4` | Хук «Он засыпает только на руках?» (2,5 с) | сток |
| `stock-mom-night-phone.mp4` | Вечер по часам (5 с) | сток |
| `ai-nursery-night.mp4` | «Он не перерастёт сам» (3,5 с) | ИИ |
| `ai-crib-lamp.mp4` | Призыв забрать памятку (4 с) | ИИ |

## Сток: Pexels или Pixabay

Поисковые запросы (на английском результатов больше):

- `mother rocking baby night`, `mom holding sleeping baby`, `baby falling asleep in arms`
- `tired mother night phone`, `mother awake at night baby`

Что искать: полумрак, тёплый свет, лица мамы и малыша не в фокусе или со спины, спокойное движение. Не подходят яркие студийные кадры и улыбки в камеру.

Лицензии Pexels и Pixabay разрешают коммерческое использование без указания автора.

## ИИ-фон: Kling, Runway, Veo

В кадре нет людей. Промпты на английском, соотношение сторон 9:16, длительность 5 секунд.

**`ai-nursery-night.mp4`**

```
Cozy baby nursery at night, empty wooden crib with soft white bedding, warm amber night lamp glowing on a shelf, deep navy blue shadows, slow gentle camera push-in, dust particles floating in lamp light, calm and quiet atmosphere, cinematic, shallow depth of field, no people, no text
```

**`ai-crib-lamp.mp4`**

```
Close-up of a small warm night lamp next to a baby crib, soft amber glow, gentle light flicker, blurred crib bars in the foreground, dark navy background, slow dolly to the side, peaceful bedtime mood, cinematic, no people, no text
```

Если сервис спрашивает стиль, выбирайте реалистичный или кинематографичный, без аниме и иллюстраций. Если на первом кадре генерации появился человек, перегенерируйте: ИИ-лица в этой нише снижают доверие.
