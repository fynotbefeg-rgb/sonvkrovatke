"""One development entrypoint: four parts + verified speech caches → three montage renders.

No fresh ASR, Google, approvals or publication. Reuses the existing assembler,
cache binder, Claude Director/Remotion wrapper and original-audio preservation.
"""
import argparse
import importlib.util
import json
from pathlib import Path

import factory_media as media
import shared_body_plans


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


assembler = load('shared_run_assembler', 'assemble-source-set.py')
prepared = load('shared_run_jobs', 'prepare-assembled-jobs.py')
montage = load('shared_run_montage', 'run-development-montage.py')


def write_json(file, data):
    with Path(file).open('x', encoding='utf-8') as stream:
        stream.write(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n')


def run(plan, body, hooks, public_directory, output_directory, browser=None, render_hooks=(1, 2, 3), renderer=None):
    selected = tuple(render_hooks)
    if not selected or len(set(selected)) != len(selected) or any(type(n) is not int or n not in {1, 2, 3} for n in selected):
        raise ValueError('Select distinct hook numbers 1/2/3')
    if plan.get('assemblyVersion') != '1.0.0' or plan.get('mode') != 'development':
        raise ValueError('Only four-part development source-set v1 supported')
    if set(hooks) != {1, 2, 3}:
        raise ValueError('All three exact hook speech caches are required')
    if not isinstance(public_directory, str) or not public_directory or any(c in public_directory for c in ['\\', ':']) or '..' in Path(public_directory).parts:
        raise ValueError('Unsafe assembled-source directory')
    source_dir = (media.PUBLIC / public_directory).resolve()
    allowed = (media.PUBLIC / 'rr/incoming').resolve()
    if not source_dir.is_relative_to(allowed) or source_dir == allowed:
        raise ValueError('Assembled sources must be under rr/incoming')
    output = Path(output_directory).resolve()
    if output.exists() or source_dir.exists():
        raise ValueError('New source and output directories required; no overwrite')
    # Validate the original files/cache binding before creating output artifacts.
    assembler.verify(plan)
    for speech in [body, *hooks.values()]:
        prepared.development.prepare(speech)
    original = {p['localPath']: p['sha256'] for p in [plan['body'], *plan['hooks']]}
    for part, speech in [(plan['body'], body), *[(p, hooks[p['hookNumber']]) for p in plan['hooks']]]:
        if part['localPath'] != speech['sourceRelativePath'] or part['sha256'] != speech['sourceSha256']:
            raise ValueError('Speech cache does not belong to source part')
    output.mkdir(parents=True, exist_ok=False)
    report = {'mode': 'development', 'productionReady': False, 'approvalStatus': 'pending_approval',
              'freshRecognition': False, 'needsSpeechReview': True,
              'timingMethod': 'verified_cached_part_timings_with_assembly_offset',
              'requestedHooks': list(selected), 'complete': False, 'renders': []}
    report_file = output / 'pipeline-report.json'
    write_json(report_file, report)
    manifest = assembler.assemble(plan, source_dir)
    jobs = prepared.prepare(manifest, body, hooks, public_directory)
    for job, evidence in jobs:
        write_json(output / f"{job['reelId']}-job.json", job)
        write_json(output / f"{job['reelId']}-speech.json", evidence)
    # The body is planned once; each variant gets that plan shifted by its own manifest boundary plus its hook plan.
    body_plan, plans = shared_body_plans.build(manifest, jobs, body, hooks)
    write_json(output / 'shared-body-plan.json', body_plan)
    for job, _ in jobs:
        write_json(output / f"{job['reelId']}-plan.json", plans[job['hookNumber']])
    report['sharedBodyPlan'] = True
    report_file.write_text(json.dumps(report, indent=2) + '\n')
    renderer = renderer or montage.run
    for job, _ in jobs:
        if job['hookNumber'] not in selected:
            continue
        qc = renderer(job, output / f"h{job['hookNumber']}", browser, montage_plan=plans[job['hookNumber']])
        if qc.get('technicalPassed') is not True:
            raise ValueError('Montage technical QC did not pass')
        report['renders'].append({'hookNumber': job['hookNumber'], 'reelId': job['reelId'],
                                  'technicalPassed': True, 'outputSha256': qc['outputSha256']})
        report_file.write_text(json.dumps(report, indent=2) + '\n')
    for relative, checksum in original.items():
        if media.sha256(media.public_source(relative)) != checksum:
            raise ValueError('Original part changed during pipeline')
    report['complete'] = len(report['renders']) == len(selected)
    report['allThreeRendered'] = {v['hookNumber'] for v in report['renders']} == {1, 2, 3}
    report_file.write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source_set')
    parser.add_argument('--body-speech', required=True)
    parser.add_argument('--hook-speech', nargs=3, required=True)
    parser.add_argument('--public-directory', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--browser-executable')
    parser.add_argument('--render-hooks', nargs='+', type=int, default=[1, 2, 3])
    args = parser.parse_args()
    read = lambda file: json.loads(Path(file).read_text(encoding='utf-8'))
    run(read(args.source_set), read(args.body_speech), {n: read(file) for n, file in enumerate(args.hook_speech, 1)},
        args.public_directory, args.out, args.browser_executable, args.render_hooks)
    print('Development pipeline passed. Cached speech still needs review; no publication allowed.')
