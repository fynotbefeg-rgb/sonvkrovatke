import json, re, bisect, subprocess, glob
pairs = json.load(open('vo/remap.json'))
xs = [p[0] for p in pairs]; ys = [p[1] for p in pairs]
def f(t):
    if t <= xs[0]: return t
    if t >= xs[-1]: return ys[-1] + (t - xs[-1])
    i = bisect.bisect(xs, t) - 1
    x0, x1, y0, y1 = xs[i], xs[i+1], ys[i], ys[i+1]
    return y0 + (t - x0) * (y1 - y0) / (x1 - x0) if x1 > x0 else y0
r = lambda t: round(f(t), 2)
p = 'pv/src/FormulaVO.tsx'; s = open(p).read()
# IT array
m = re.search(r'const IT = \[([^\]]*)\]', s)
s = s.replace(m.group(0), 'const IT = [' + ', '.join(str(r(float(x))) for x in m.group(1).split(',')) + ']')
s = s.replace('FVO_FRAMES = fr(55.6)', 'FVO_FRAMES = fr(%s)' % r(55.6))
def sub_num(mm):
    v = float(mm.group(2))
    return mm.group(1) + str(r(v)) + mm.group(3)
s = re.sub(r'((?:\ba|\bb|\bbase|\bat)=\{)(\d+\.?\d*)(\})', sub_num, s)
s = re.sub(r'(\[\"[^\"]+\", )(\d+\.?\d*)(\])', sub_num, s)
# wave durations
s = s.replace('dur={fr(2.9)}', 'dur={fr(%s)}' % r(2.9))
s = re.sub(r'dur=\{fr\(11\.9\)\}', 'dur={fr(%s)}' % round(r(55.6) - r(43.7), 2), s)
# strike timing uses fr(3.3) offset from 32.3 -> keep relative
open(p, 'w').write(s)
# cuts
cp = 'pv/src/fvoCuts.ts'; cs = open(cp).read(); C = json.loads(cs[cs.index('['):cs.rindex(']') + 1])
for c in C:
    c['a'] = r(c['a']); c['b'] = r(c['b'])
open(cp, 'w').write('export const CUTS = ' + json.dumps(C) + ';\n')
print(re.findall(r'const IT = \[[^\]]*\]', s)); print([(c['n'], c['a'], c['b']) for c in C])
