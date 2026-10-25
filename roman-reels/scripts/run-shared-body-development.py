"""One development entrypoint: four parts + verified speech caches → three montage renders.

No fresh ASR, Google, approvals or publication. Reuses the existing assembler,
cache binder, Claude Director/Remotion wrapper and original-audio preservation.
An optional editorial plan (editorial_plan.py) replaces the automatic subtitles and plans of all three variants;
it is fully checked before the first render, and a mismatch stops the run without the automatic plan as fallback.
"""
import argparse
import importlib.util
import json
from pathlib import Path

import editorial_plan as editorial
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


def editorial_inputs(plan, editorial_plan_file, editorial_directory, editorial_sha256=None):
    """Optional editorial plan: both arguments or neither; checked before any output is created."""
    if editorial_plan_file is None and editorial_directory is None and editorial_sha256 is None:
        return None
    if not isinstance(editorial_directory, str) or not editorial_directory or any(c in editorial_directory for c in ['\\', ':']) \
            or '..' in Path(editorial_directory).parts or editorial_plan_file is None:
        raise ValueError('Editorial plan needs its PNG copy folder under rr/incoming')
    folder = (media.PUBLIC / editorial_directory).resolve()
    if not folder.is_relative_to((media.PUBLIC / 'rr/incoming').resolve()) or not folder.is_dir():
        raise ValueError('Editorial PNG copy folder must exist under rr/incoming')
    edit = editorial.load(editorial_plan_file, editorial_sha256)
    editorial.check_parts(edit[0], plan.get('topicId'), {'body': plan['body']['sha256'],
                          **{f"h{h['hookNumber']}": h['sha256'] for h in plan['hooks']}})
    return edit


def run(plan, body, hooks, public_directory, output_directory, browser=None, render_hooks=(1, 2, 3), renderer=None,
        render_concurrency=montage.DEFAULT_RENDER_CONCURRENCY, video_cache_size_in_bytes=None,
        editorial_plan_file=None, editorial_directory=None, editorial_sha256=None):
    montage.check_render_concurrency(render_concurrency)  # before any file, folder or process is created
    montage.check_video_cache_size(video_cache_size_in_bytes)
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
    edit = editorial_inputs(plan, editorial_plan_file, editorial_directory, editorial_sha256)
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
              'requestedHooks': list(selected), 'renderConcurrency': render_concurrency,
              'offthreadVideoCacheSizeInBytes': video_cache_size_in_bytes,
              'complete': False, 'renders': []}
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
    jobs = [job for job, _ in jobs]
    if edit is not None:
        # All three variants are bound and validated before the first render; any error stops here, with no
        # fallback to the automatic plans written above (they stay only as a record).
        edited, plans = editorial.apply(*edit, editorial_directory, manifest, [(job, None) for job in jobs])
        for number in sorted(edited):
            montage.check_supplied_plan(edited[number], plans[number])
        jobs = [edited[number] for number in sorted(edited)]
        for job in jobs:
            write_json(output / f"{job['reelId']}-editorial-job.json", job)
            write_json(output / f"{job['reelId']}-editorial-plan.json", plans[job['hookNumber']])
        report['editorialPlan'] = {'sha256': edit[1]['sha256'], 'files': edit[1]['files']}
    report_file.write_text(json.dumps(report, indent=2) + '\n')
    renderer = renderer or montage.run
    # Passed only when set, so the default call to the renderer stays exactly as before.
    cache_option = {} if video_cache_size_in_bytes is None else {'video_cache_size_in_bytes': video_cache_size_in_bytes}
    for job in jobs:
        if job['hookNumber'] not in selected:
            continue
        if edit is not None:
            editorial.verify_copies(edit[1], editorial_directory)
        qc = renderer(job, output / f"h{job['hookNumber']}", browser, montage_plan=plans[job['hookNumber']],
                      render_concurrency=render_concurrency, **cache_option)
        if qc.get('technicalPassed') is not True:
            raise ValueError('Montage technical QC did not pass')
        report['renders'].append({'hookNumber': job['hookNumber'], 'reelId': job['reelId'],
                                  'technicalPassed': True, 'outputSha256': qc['outputSha256']})
        report_file.write_text(json.dumps(report, indent=2) + '\n')
    for relative, checksum in original.items():
        if media.sha256(media.public_source(relative)) != checksum:
            raise ValueError('Original part changed during pipeline')
    if edit is not None:
        editorial.verify_copies(edit[1], editorial_directory)  # an insert replaced during a render fails the run
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
    parser.add_argument('--editorial-plan', help='Optional reviewed editorial plan (JSON next to its PNG files)')
    parser.add_argument('--editorial-public-directory', help='rr/incoming folder with the copies of its PNG files')
    parser.add_argument('--editorial-plan-sha256', help='Confirmed SHA-256 the editorial plan must have')
    parser.add_argument('--render-concurrency', type=int, choices=montage.ALLOWED_RENDER_CONCURRENCY,
                        default=montage.DEFAULT_RENDER_CONCURRENCY,
                        help='Remotion workers per render: 1 (less memory) or 2 (default)')
    parser.add_argument('--offthreadvideo-cache-size-in-bytes', type=int, dest='video_cache_size_in_bytes',
                        help='OffthreadVideo cache limit per render, bytes 67108864..8589934592 '
                             '(e.g. 268435456); omitted = Remotion default')
    args = parser.parse_args()
    try:
        montage.check_video_cache_size(args.video_cache_size_in_bytes)
    except ValueError as error:
        parser.error(str(error))  # exit 2 before any file is read or created
    read = lambda file: json.loads(Path(file).read_text(encoding='utf-8'))
    run(read(args.source_set), read(args.body_speech), {n: read(file) for n, file in enumerate(args.hook_speech, 1)},
        args.public_directory, args.out, args.browser_executable, args.render_hooks,
        render_concurrency=args.render_concurrency, video_cache_size_in_bytes=args.video_cache_size_in_bytes,
        editorial_plan_file=args.editorial_plan, editorial_directory=args.editorial_public_directory,
        editorial_sha256=args.editorial_plan_sha256)
    print('Development pipeline passed. Cached speech still needs review; no publication allowed.')
