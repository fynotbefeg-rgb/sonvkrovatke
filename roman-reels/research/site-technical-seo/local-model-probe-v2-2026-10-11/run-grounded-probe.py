"""Bounded local-only fixture interpretation. Never production, no API calls."""
import argparse,json,subprocess,time,hashlib,platform,datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--engine',required=True);p.add_argument('--model',required=True);p.add_argument('--output',required=True);a=p.parse_args()
out=Path(a.output);out.mkdir(exist_ok=False,parents=True)
system="""You explain findings from a deterministic checker on a SYNTHETIC site. You are NOT the checker and must NOT change technicalVerdict. Return exactly one JSON object with only id, verdict, evidence, explanation, suggestedFix. verdict MUST equal input technicalVerdict. evidence must quote supplied observation, not invented data. Explain only the scope of this ONE check. noindex conflicts with intendedIndexable=true: it is an issue, not pass. index,follow does not establish actual Google indexing. With no Search Console/traffic/index-check data, Google indexing and traffic growth are UNKNOWN. Never say the whole site follows best practices, was repaired, is indexed or has higher traffic. Never suggest third-party tools, paid services, installation or new measurements as if done. Suggested fixes are proposals only; do not claim success. Keep explanation and suggestedFix each under 35 words. No Markdown."""
cases=[{'id':'noindex','technicalVerdict':'issue','scope':'meta robots directive on the homepage only','input':{'path':'/','httpStatus':200,'metaRobots':'noindex','intendedIndexable':True,'searchConsoleData':None}},
 {'id':'fixed','technicalVerdict':'pass','scope':'meta robots directive on the homepage only','input':{'path':'/','httpStatus':200,'metaRobots':'index,follow','intendedIndexable':True,'searchConsoleData':None}},
 {'id':'unknown-indexing','technicalVerdict':'unknown','scope':'Google indexing and organic traffic; no supplied evidence','input':{'question':'Is this site indexed in Google and did its organic traffic increase?','searchConsoleData':None,'trafficData':None,'indexCheck':None}}]
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
report={'experimentVersion':'2.0.0','task':'Explain supplied authoritative technical status, not independently detect it','localModelCalls':len(results),'cpuThreads':2,'maxOutputTokensPerCase':256,'timeoutSecondsPerCase':90,'temperature':0,'seed':42,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'platform':platform.platform(),'machine':platform.machine(),'synthetic':True,'remoteModelCalls':0,'productionReady':False,'fullSeoAudit':False,'modelSha256':hashlib.sha256(Path(a.model).read_bytes()).hexdigest(),'results':results}
(out/'run-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'cases':len(results),'exitCodes':[r.get('exitCode') for r in results],'productionReady':False}))
