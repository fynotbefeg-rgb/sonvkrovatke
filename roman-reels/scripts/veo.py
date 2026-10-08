"""Генерация видеовставок через Gemini API (модели Veo).
Ключ берётся из переменной окружения GEMINI_API_KEY (секрет среды, в чат не присылать).

python veo.py --list                          # какие модели Veo доступны ключу
python veo.py "промпт" out.mp4 [--model ИМЯ] [--ratio 9:16] [--seconds 8]
"""
import json, os, sys, time, urllib.request

KEY = os.environ.get("GEMINI_API_KEY")
BASE = "https://generativelanguage.googleapis.com/v1beta"
if not KEY:
    sys.exit("Нет GEMINI_API_KEY в окружении")

def call(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"x-goog-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)

def veo_models():
    out, tok = [], ""
    while True:
        d = call(f"{BASE}/models?pageSize=200" + (f"&pageToken={tok}" if tok else ""))
        out += [m["name"].split("/", 1)[1] for m in d.get("models", []) if "veo" in m["name"]]
        tok = d.get("nextPageToken")
        if not tok:
            return sorted(out)

args = sys.argv[1:]
if "--list" in args:
    print("\n".join(veo_models())); sys.exit()
opt = lambda k, d: args[args.index(k) + 1] if k in args else d
prompt, out = args[0], args[1]
model = opt("--model", None) or veo_models()[-1]
params = {"aspectRatio": opt("--ratio", "9:16"), "durationSeconds": int(opt("--seconds", "8"))}
op = call(f"{BASE}/models/{model}:predictLongRunning", {"instances": [{"prompt": prompt}], "parameters": params})
print("модель", model, "операция", op["name"])
while not op.get("done"):
    time.sleep(10)
    op = call(f"{BASE}/{op['name']}")
if "error" in op:
    sys.exit(f"ошибка: {op['error']}")
uri = op["response"]["generateVideoResponse"]["generatedSamples"][0]["video"]["uri"]
req = urllib.request.Request(uri, headers={"x-goog-api-key": KEY})
with urllib.request.urlopen(req, timeout=300) as r, open(out, "wb") as f:
    f.write(r.read())
print("готово:", out)
