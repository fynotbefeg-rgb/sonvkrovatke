import json
from dataclasses import asdict
from bs4 import BeautifulSoup
from geo_optimizer.core.audit_js import audit_js_rendering
html='<!doctype html><html><head><title>Static test</title></head><body><p>This small static page already contains every word of its message in the original HTML and uses no JavaScript to show any of its content.</p></body></html>'
soup=BeautifulSoup(html,'html.parser')
result=audit_js_rendering(soup,html)
proof={'fixtureType':'owned_static_counterexample','html':html,'scriptTagCount':len(soup.find_all('script')),'expectedJsDependent':False,'observed':asdict(result)}
assert proof['scriptTagCount']==0
assert result.js_dependent is True, 'Changed upstream result; reassess the finding'
with open('/tmp/seo-plugin-check/static-counterexample.json','w') as f: json.dump(proof,f,ensure_ascii=False,indent=2)
print('Confirmed false positive: zero scripts, all text in HTML, js_dependent=True')
