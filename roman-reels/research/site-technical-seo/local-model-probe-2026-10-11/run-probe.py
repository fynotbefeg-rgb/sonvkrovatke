"""Bounded local-only fixture interpretation. Never production, no API calls."""
import argparse,json,subprocess,time,hashlib,platform,datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--engine',required=True);p.add_argument('--model',required=True);p.add_argument('--output',required=True);a=p.parse_args()
out=Path(a.output);out.mkdir(exist_ok=False,parents=True)
system='You interpret synthetic website observations. Use only supplied evidence. Do not invent traffic, Google indexing, rankings, repairs or measurements. Return JSON only with fields id, verdict (issue, pass, unknown), evidence, explanation, suggestedFix. A proposed fix is not an executed fix.'
cases=[{'id':'noindex','input':{'path':'/','httpStatus':200,'metaRobots':'noindex','intendedIndexable':True,'searchConsoleData':None}},
 {'id':'fixed','input':{'path':'/','httpStatus':200,'metaRobots':'index,follow','intendedIndexable':True,'searchConsoleData':None}},
 {'id':'unknown-indexing','input':{'question':'Is this site indexed in Google and did its organic traffic increase?','searchConsoleData':None,'trafficData':None,'indexCheck':None}}]
results=[]
for case in cases:
 prompt='<|im_start|>system\n'+system+'<|im_end|>\n<|im_start|>user\n'+json.dumps(case)+'<|im_end|>\n<|im_start|>assistant\n'
 prompt_file=out/(case['id']+'-prompt.txt');prompt_file.write_text(prompt)
 command=[str(Path(a.engine).resolve()),'-m',str(Path(a.model).resolve()),'-f',str(prompt_file.resolve()),'-n','256','-c','2048','-t','2','--temp','0','--seed','42','--no-conversation','--no-display-prompt']
 started=time.monotonic()
 try:
  run=subprocess.run(command,capture_output=True,text=True,timeout=90,stdin=subprocess.DEVNULL)
  (out/(case['id']+'-stdout.txt')).write_text(run.stdout);(out/(case['id']+'-stderr.txt')).write_text(run.stderr)
  results.append({'id':case['id'],'exitCode':run.returncode,'seconds':round(time.monotonic()-started,3),'command':command,'output':run.stdout})
 except subprocess.TimeoutExpired:
  results.append({'id':case['id'],'status':'timeout','seconds':90})
report={'cpuThreads':2,'maxOutputTokensPerCase':256,'timeoutSecondsPerCase':90,'temperature':0,'seed':42,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'platform':platform.platform(),'machine':platform.machine(),'synthetic':True,'remoteModelCalls':0,'productionReady':False,'fullSeoAudit':False,'modelSha256':hashlib.sha256(Path(a.model).read_bytes()).hexdigest(),'results':results}
(out/'run-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'cases':len(results),'exitCodes':[r.get('exitCode') for r in results],'productionReady':False}))
