"""One command for four local MP4s (body, h1, h2, h3): source set -> ASR -> shared-body montage.

Development only. Without --execute it checks the inputs (ffprobe/ffmpeg read and decode the
files) and prints the plan; no working files or folders are created, ASR and rendering are not
started. With --execute it copies the parts under pv/public/rr/incoming, writes the source set
and runs the existing transcribe-development-source.py and run-shared-body-development.py as
separate processes, one at a time, stopping at the first failure without retrying. Approvals and
productionReady are never set; recognized speech always needs review. No Google, Drive or HeyGen.
An optional --editorial-plan (reviewed subtitles, PNG inserts and montage plans bound to these four originals) is
checked in plan mode too; with --execute its PNG files are copied under rr/incoming and the plan goes to the montage
step, which validates it before any render. Without it the commands and the report are exactly as before.
"""
import argparse
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

import editorial_plan as editorial
import factory_media as media


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


assembler = load('local_four_assembler', 'assemble-source-set.py')
montage = load('local_four_montage', 'run-development-montage.py')

SCRIPTS = Path(__file__).resolve().parent
PARTS = ('body', 'h1', 'h2', 'h3')
# Laptop settings proven by the 18.10 h1/h2/h3 runs; not configurable here on purpose.
LAPTOP_RENDER_CONCURRENCY = 1
LAPTOP_VIDEO_CACHE_BYTES = 268435456
ASR_THREADS = 2
NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}')
TOPIC = re.compile(r'[a-z0-9][a-z0-9_-]*')


def require(ok, message):
    if not ok:
        raise ValueError(message)


def check_editorial(file, topic_id, output, inputs, public, expected_sha256=None):
    """Optional editorial plan: structure, PNG hashes and binding to the four originals, before anything is created.

    expected_sha256: the hash confirmed in the bot; it also goes to the montage step, which loads the plan again.
    """
    plan_file = Path(file).absolute()  # not resolved: a link in place of the plan is refused by editorial.load
    incoming = (media.PUBLIC / 'rr/incoming').resolve()
    require(not plan_file.resolve().is_relative_to(output) and not plan_file.resolve().is_relative_to(incoming),
            'Editorial plan must stay outside the output and incoming folders')
    plan, record = editorial.load(plan_file, expected_sha256)
    editorial.check_parts(plan, topic_id, {part: inputs[part]['sha256'] for part in PARTS})
    public['editorial'] = f'rr/incoming/{output.name}-editorial'
    require(not (media.PUBLIC / public['editorial']).exists(), 'New public folders required; no overwrite')
    return record


def check_inputs(parts, topic_id, output, model_path=None, browser=None, render_hooks=(1, 2, 3)):
    """Verified via ffprobe/ffmpeg before any working file or folder is created or ASR/render is started."""
    montage.check_render_concurrency(LAPTOP_RENDER_CONCURRENCY)
    montage.check_video_cache_size(LAPTOP_VIDEO_CACHE_BYTES)
    require(isinstance(topic_id, str) and TOPIC.fullmatch(topic_id), 'Invalid topic ID')
    hooks = tuple(render_hooks)
    require(hooks and len(set(hooks)) == len(hooks) and all(type(n) is int and n in {1, 2, 3} for n in hooks),
            'Select distinct hook numbers 1/2/3')
    output = Path(output).resolve()
    require(NAME.fullmatch(output.name), 'Output folder name: letters, digits, - and _ only')
    require(not output.exists(), 'New output folder required; no overwrite')
    incoming = (media.PUBLIC / 'rr/incoming').resolve()
    public = {'parts': f'rr/incoming/{output.name}-parts', 'assembled': f'rr/incoming/{output.name}-assembled'}
    for relative in public.values():
        require(not (media.PUBLIC / relative).exists(), 'New public folders required; no overwrite')
    resolved, inputs = set(), {}
    for part in PARTS:
        path = Path(parts[part]).resolve(strict=True)
        require(path.is_file() and path.suffix.lower() == '.mp4', f'{part}: an existing .mp4 file is required')
        require(path not in resolved, 'body, h1, h2 and h3 must be four distinct files')
        require(not path.is_relative_to(output) and not path.is_relative_to(incoming),
                f'{part}: source must stay outside the output and incoming folders')
        resolved.add(path)
        metadata = media.probe(path)
        media.decode(path)
        inputs[part] = {'path': str(path), 'sha256': media.sha256(path), 'bytes': path.stat().st_size,
                        'metadata': metadata, 'publicPath': f"{public['parts']}/{part}.mp4"}
    if model_path is not None:
        require((Path(model_path) / 'model.bin').is_file(), 'Local ASR model (model.bin) is required; nothing is downloaded')
    if browser is not None:
        require(Path(browser).is_file(), 'Browser executable must be a local file')
    return output, public, inputs, hooks


def source_set(topic_id, inputs):
    return {'assemblyVersion': '1.0.0', 'mode': 'development', 'topicId': topic_id,
            'body': {'localPath': inputs['body']['publicPath'], 'sha256': inputs['body']['sha256']},
            'hooks': [{'hookNumber': n, 'localPath': inputs[f'h{n}']['publicPath'], 'sha256': inputs[f'h{n}']['sha256']}
                      for n in (1, 2, 3)]}


def commands(output, public, inputs, hooks, model_path, model_revision, browser, editorial_plan=None):
    """Argument lists for the existing scripts; the launcher adds no ASR or montage logic of its own."""
    steps = [{'name': f'asr-{part}', 'command': [
        sys.executable, str(SCRIPTS / 'transcribe-development-source.py'), '--source', inputs[part]['publicPath'],
        '--model-path', str(model_path), '--model-revision', str(model_revision),
        '--out', str(output / 'asr' / part), '--threads', str(ASR_THREADS)]} for part in PARTS]
    montage_command = [
        sys.executable, str(SCRIPTS / 'run-shared-body-development.py'), str(output / 'source-set.json'),
        '--body-speech', str(output / 'asr/body/speech.json'),
        '--hook-speech', *[str(output / f'asr/h{n}/speech.json') for n in (1, 2, 3)],
        '--public-directory', public['assembled'], '--out', str(output / 'montage'),
        '--render-hooks', *[str(n) for n in hooks],
        '--render-concurrency', str(LAPTOP_RENDER_CONCURRENCY),
        '--offthreadvideo-cache-size-in-bytes', str(LAPTOP_VIDEO_CACHE_BYTES)]
    if browser is not None:
        montage_command += ['--browser-executable', str(Path(browser).resolve())]
    if editorial_plan is not None:
        montage_command += ['--editorial-plan', editorial_plan['path'], '--editorial-public-directory', public['editorial'],
                            '--editorial-plan-sha256', editorial_plan['sha256']]
    return steps + [{'name': 'montage', 'command': montage_command}]


def write_new(file, data):
    with Path(file).open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def save(file, data):
    Path(file).write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def run(parts, topic_id, output, model_path=None, model_revision=None, browser=None, render_hooks=(1, 2, 3),
        execute=False, runner=subprocess.run, editorial_plan=None, editorial_sha256=None):
    if execute:
        require(model_path is not None and model_revision, '--execute needs --model-path and --model-revision')
        require(browser is not None, '--execute needs --browser-executable')
    # Child steps run with cwd=SCRIPTS, so a relative model path must be fixed against the caller's folder now.
    model_path = Path(model_path).resolve() if model_path is not None else None
    output, public, inputs, hooks = check_inputs(parts, topic_id, output, model_path, browser, render_hooks)
    require(editorial_sha256 is None or editorial_plan is not None, '--editorial-plan-sha256 needs --editorial-plan')
    edit = None if editorial_plan is None else check_editorial(editorial_plan, topic_id, output, inputs, public, editorial_sha256)
    steps = commands(output, public, inputs, hooks, model_path or '<model-path>', model_revision or '<model-revision>', browser,
                     edit)
    report = {'mode': 'development', 'productionReady': False, 'approvalStatus': 'pending_approval',
              'needsSpeechReview': True, 'execute': execute, 'topicId': topic_id, 'output': str(output),
              'publicDirectories': public, 'inputs': inputs, 'renderHooks': list(hooks),
              'renderConcurrency': LAPTOP_RENDER_CONCURRENCY, 'offthreadVideoCacheSizeInBytes': LAPTOP_VIDEO_CACHE_BYTES,
              'sourceSet': source_set(topic_id, inputs), 'steps': [{**s, 'status': 'planned'} for s in steps],
              'complete': False}
    if edit is not None:
        report['editorialPlan'] = edit
    if not execute:
        return report  # plan only: inputs probed by ffprobe/ffmpeg; no working files, no ASR, no render
    output.mkdir(parents=True)
    (output / 'logs').mkdir()
    report_file = output / 'launch-report.json'
    write_new(report_file, report)
    parts_dir = media.PUBLIC / public['parts']
    parts_dir.mkdir(parents=True)
    for part in PARTS:
        copy = parts_dir / f'{part}.mp4'
        with Path(inputs[part]['path']).open('rb') as source, copy.open('xb') as target:
            shutil.copyfileobj(source, target)
        require(media.sha256(copy) == inputs[part]['sha256'], f'{part}: copy checksum mismatch')
    if edit is not None:
        editorial_dir = media.PUBLIC / public['editorial']
        editorial_dir.mkdir(parents=True)
        for name, info in edit['files'].items():
            copy = editorial_dir / name
            source_file = Path(edit['path']).parent / name
            require(not source_file.is_symlink(), f'{name}: link refused')
            with source_file.open('rb') as source, copy.open('xb') as target:
                shutil.copyfileobj(source, target)
            require(media.sha256(copy) == info['sha256'], f'{name}: copy checksum mismatch')
    assembler.verify(report['sourceSet'])  # same check the montage step repeats
    write_new(output / 'source-set.json', report['sourceSet'])
    for step in report['steps']:
        step.update(status='running', startedAt=datetime.now(timezone.utc).isoformat())
        save(report_file, report)
        started = time.monotonic()
        with (output / f"logs/{step['name']}.stdout.log").open('x', encoding='utf-8') as out, \
                (output / f"logs/{step['name']}.stderr.log").open('x', encoding='utf-8') as err:
            code = runner(step['command'], cwd=SCRIPTS, stdout=out, stderr=err, check=False).returncode
        step.update(exitCode=code, seconds=round(time.monotonic() - started, 3),
                    status='passed' if code == 0 else 'failed')
        save(report_file, report)
        if code != 0:
            raise RuntimeError(f"{step['name']} failed with exit code {code}; stopped without retry")
    for part in PARTS:
        require(media.sha256(inputs[part]['path']) == inputs[part]['sha256'], f'{part}: original changed during run')
    if edit is not None:
        require(media.sha256(edit['path']) == edit['sha256'], 'editorial plan changed during run')
    pipeline = json.loads((output / 'montage/pipeline-report.json').read_text(encoding='utf-8'))
    if edit is not None:
        require(pipeline.get('editorialPlan', {}).get('sha256') == edit['sha256'], 'montage did not apply the editorial plan')
    report.update(complete=pipeline.get('complete') is True, montageReport='montage/pipeline-report.json',
                  renders=pipeline.get('renders', []))
    save(report_file, report)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    for part in PARTS:
        parser.add_argument(f'--{part}', required=True, help=f'{part} MP4')
    parser.add_argument('--topic-id', required=True)
    parser.add_argument('--out', required=True, help='New result folder (also names the rr/incoming folders)')
    parser.add_argument('--model-path', help='Local faster-whisper model folder (needed with --execute)')
    parser.add_argument('--model-revision', help='Model revision recorded in speech.json (needed with --execute)')
    parser.add_argument('--browser-executable', help='Installed Chromium/Edge (needed with --execute)')
    parser.add_argument('--render-hooks', nargs='+', type=int, default=[1, 2, 3])
    parser.add_argument('--execute', action='store_true', help='Actually run ASR and rendering; default is plan only')
    parser.add_argument('--editorial-plan', help='Optional reviewed editorial plan JSON (its PNG files next to it)')
    parser.add_argument('--editorial-plan-sha256', help='Confirmed SHA-256 of the editorial plan (set by the executor)')
    args = parser.parse_args()
    try:
        result = run({p: getattr(args, p) for p in PARTS}, args.topic_id, args.out, args.model_path,
                     args.model_revision, args.browser_executable, args.render_hooks, execute=args.execute,
                     editorial_plan=args.editorial_plan, editorial_sha256=args.editorial_plan_sha256)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(2, f'Not started: {error}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print('Plan only; add --execute to run ASR and rendering.' if not args.execute else
          'Development run finished. Speech still needs review; no approval or production.', file=sys.stderr)
