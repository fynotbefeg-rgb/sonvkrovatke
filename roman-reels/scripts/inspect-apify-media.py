"""Inspect existing private MP4 artifacts only; no network or generation."""
import base64
import json
from pathlib import Path
import subprocess

for index in range(2):
    video = Path(f'saved-media/video-{index}.mp4')
    if not video.is_file():
        print(f'MEDIA_MISSING {index}')
        continue
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration,size:stream=codec_type,codec_name,width,height',
        '-of', 'json', str(video)]))
    print('MEDIA_PROBE', index, json.dumps(probe))
    duration = float(probe['format']['duration'])
    if not 0 < duration <= 180 or video.stat().st_size > 50*1024*1024:
        raise ValueError('Media outside inspection limits')
    output = Path(f'saved-media/contact-{index}.jpg')
    subprocess.run(['ffmpeg','-v','error','-i',str(video),'-vf',
        f'fps=20/{duration},scale=200:-2,tile=5x4','-frames:v','1',
        '-q:v','6','-y',str(output)],check=True)
    encoded=base64.b64encode(output.read_bytes()).decode()
    for part in range(0,len(encoded),2000):
        print('FRAME_PART',index,part//2000,encoded[part:part+2000])
