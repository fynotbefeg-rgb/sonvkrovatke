"""Подготовка темы для RomanReel.
python prep_topic.py <topic> [--fake]
Берёт pv/public/rr/<topic>/{h1,h2,h3,osnova}.mp4, распознаёт слова (faster-whisper),
выравнивает их с утверждённым текстом (texts.json) и пишет тайминги в pv/src/romanWords.json.
--fake: без распознавания, тайминги по темпу 2.4 слова/с (для проверки шаблона).
"""
import json, os, re, subprocess, sys, difflib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # scratchpad
FF = "/usr/local/lib/python3.11/dist-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
topic = sys.argv[1]
fake = "--fake" in sys.argv
texts = json.load(open(os.path.join(ROOT, "roman/gen/texts.json")))[topic]
out_p = os.path.join(ROOT, "pv/src/romanWords.json")
data = json.load(open(out_p)) if os.path.exists(out_p) else {}

def norm(w):
    return re.sub(r"[^a-zа-я0-9]+", "", w.lower().replace("ё", "е"))

def dur(path):
    r = subprocess.run([FF, "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])

def merge_short(ws):
    out, i = [], 0
    while i < len(ws):
        w = ws[i]
        if len(norm(w[0])) <= 2 and i + 1 < len(ws) and not re.search(r"[.,!?:;—]$", w[0]):
            n = ws[i + 1]; out.append([w[0] + " " + n[0], w[1], n[2]]); i += 2
        else:
            out.append(w); i += 1
    return out

model = None
for key, fn in [("h1", "h1"), ("h2", "h2"), ("h3", "h3"), ("body", "osnova")]:
    script = [w for w in texts[key].replace("\n", " ").split(" ") if w.strip() and w != "—"]
    path = os.path.join(ROOT, f"pv/public/rr/{topic}/{fn}.mp4")
    if fake:
        t, res = 0.3, []
        for w in script:
            d = 0.42; res.append([w, round(t, 2), round(t + d - 0.05, 2)]); t += d
            if re.search(r"[.!?]$", w): t += 0.35
        data[f"{topic}.{key}"] = merge_short(res); data[f"{topic}.{key}.dur"] = round(t + 0.4, 2)
        continue
    if not os.path.exists(path):
        print("нет файла", path); continue
    if model is None:
        from faster_whisper import WhisperModel
        model = WhisperModel("medium", compute_type="int8")
    segs, _ = model.transcribe(path, language="ru", word_timestamps=True)
    rec = [[w.word.strip(), w.start, w.end] for s in segs for w in s.words]
    # выравнивание: слова сценария получают тайминги распознанных слов
    sm = difflib.SequenceMatcher(a=[norm(w) for w in script], b=[norm(r[0]) for r in rec], autojunk=False)
    times = [None] * len(script)
    for a, b, n in sm.get_matching_blocks():
        for k in range(n): times[a + k] = (rec[b + k][1], rec[b + k][2])
    # заполнить пропуски интерполяцией
    known = [i for i, x in enumerate(times) if x]
    for i in range(len(script)):
        if times[i]: continue
        prev = max([k for k in known if k < i], default=None); nxt = min([k for k in known if k > i], default=None)
        t0 = times[prev][1] if prev is not None else 0.0
        t1 = times[nxt][0] if nxt is not None else t0 + 0.5
        span = (nxt if nxt is not None else i + 1) - (prev if prev is not None else -1)
        pos = i - (prev if prev is not None else -1)
        s = t0 + (t1 - t0) * (pos - 1) / span; e = t0 + (t1 - t0) * pos / span
        times[i] = (s, e)
    res = [[w, round(s, 2), round(e, 2)] for w, (s, e) in zip(script, times)]
    matched = sum(1 for x in sm.get_matching_blocks() for _ in range(x[2]))
    print(key, f"совпало {matched}/{len(script)} слов")
    data[f"{topic}.{key}"] = merge_short(res); data[f"{topic}.{key}.dur"] = round(dur(path), 2)
json.dump(data, open(out_p, "w"), ensure_ascii=False)
print("ok", topic)
