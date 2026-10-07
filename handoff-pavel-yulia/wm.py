# Водяной знак: диагональная сетка полупрозрачного текста. usage: wm.py in.jpg out.jpg [текст]
import sys, math
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
text = sys.argv[3] if len(sys.argv) > 3 else "ОБРАЗЕЦ • @ferzas1o"
im = Image.open(src).convert("RGBA")
W, H = im.size
fs = max(24, int(min(W, H) * 0.045))
font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", fs)
D = int(math.hypot(W, H)) + fs * 4
layer = Image.new("RGBA", (D, D), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
tw = d.textlength(text, font=font)
sx, sy = int(tw + fs * 5), int(fs * 7)
for row, y in enumerate(range(0, D, sy)):
    off = (sx // 2) * (row % 2)
    for x in range(-sx + off, D, sx):
        d.text((x, y), text, font=font, fill=(255, 255, 255, 48), stroke_width=max(1, fs // 18), stroke_fill=(0, 0, 0, 30))
layer = layer.rotate(30, resample=Image.BICUBIC)
l, t = (D - W) // 2, (D - H) // 2
im = Image.alpha_composite(im, layer.crop((l, t, l + W, t + H)))
im.convert("RGB").save(dst, quality=90)
