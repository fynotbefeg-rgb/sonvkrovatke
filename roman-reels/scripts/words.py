import sys, json
from faster_whisper import WhisperModel
m = WhisperModel("medium", compute_type="int8")
segs, _ = m.transcribe(sys.argv[1], language="ru", word_timestamps=True)
W = []
for s in segs:
    for w in s.words:
        W.append([w.word.strip(), round(w.start, 2), round(w.end, 2)])
json.dump(W, open(sys.argv[2], 'w'), ensure_ascii=False)
print(len(W), W[:12])
