"""Optional editorial plan of one kit: reviewed subtitles, visual assets and montage plan for the three variants.

It replaces only wordTimings/speechSegments/hookText/scriptText/visualAssets and the montage plan of the prepared
jobs; the source video, render settings, mode and approval/production status always come from the automatic job.
Every binding (part and assembly SHA-256, ASR word intervals, PNG hashes, shared body) is checked before any render;
any mismatch stops the run, there is no fallback to the automatic plan. No ASR, Director changes or network.
"""
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re

import factory_media as media

_spec = importlib.util.spec_from_file_location('editorial_contract', Path(__file__).with_name('validate-factory-job.py'))
contract = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(contract)

VERSION = '1.0.0'
PARTS = ('body', 'h1', 'h2', 'h3')
TOP_KEYS = {'editorialPlanVersion', 'topicId', 'parts', 'files', 'variants'}
VARIANT_KEYS = {'assembledSha256', 'hookText', 'scriptText', 'wordTimings', 'speechSegments', 'visualAssets', 'montagePlan'}
ASSET_KEYS = {'id', 'type', 'file', 'rightsReference'}
FILE = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.png', re.IGNORECASE)
SHA = re.compile(r'[0-9a-f]{64}')
MAX_PLAN_BYTES = 4 * 1024 * 1024
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_FILES = 32
EPSILON = 1e-6


def require(ok, message):
    if not ok:
        raise ValueError(f'Editorial plan: {message}')


def _plain_file(folder, name, limit):
    """A regular file directly in folder: no separators, '..', links or anything resolving elsewhere."""
    require(isinstance(name, str) and Path(name).name == name and '..' not in name, f'unsafe file name {name!r}')
    file = folder / name
    require(not file.is_symlink() and file.is_file(), f'{name}: regular file required')
    require(file.resolve().parent == folder.resolve(), f'{name}: outside the plan folder')
    require(0 < file.stat().st_size <= limit, f'{name}: size out of range')
    return file


def load(plan_file, expected_sha256=None):
    """Reads the plan and checks its structure and the PNG files next to it; returns (plan, record).

    The plan is hashed and parsed from one read; with expected_sha256 (the confirmed hash) other content is refused.
    The path is used as given (never resolved first), so a link in its place is refused rather than followed.
    """
    plan_file = Path(plan_file).absolute()
    folder = plan_file.parent
    _plain_file(folder, plan_file.name, MAX_PLAN_BYTES)
    require(plan_file.suffix.lower() == '.json', 'plan must be a .json file')
    data = plan_file.read_bytes()
    checksum = hashlib.sha256(data).hexdigest()
    require(expected_sha256 is None or checksum == expected_sha256, 'plan differs from the confirmed SHA-256')
    try:
        plan = json.loads(data.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ValueError('Editorial plan: not valid UTF-8 JSON') from None
    require(isinstance(plan, dict) and set(plan) == TOP_KEYS, f'top-level keys must be exactly {sorted(TOP_KEYS)}')
    require(plan['editorialPlanVersion'] == VERSION, 'unsupported version')
    require(isinstance(plan['parts'], dict) and set(plan['parts']) == set(PARTS) and
            all(isinstance(v, str) and SHA.fullmatch(v) for v in plan['parts'].values()), 'parts: four SHA-256 required')
    files = plan['files']
    require(isinstance(files, dict) and 0 < len(files) <= MAX_FILES, 'files: 1..32 PNG files required')
    require(len({str(name).lower() for name in files}) == len(files), 'files: names differ only by case')
    record = {'path': str(plan_file), 'sha256': checksum, 'files': {}}
    for name, checksum in files.items():
        require(isinstance(name, str) and FILE.fullmatch(name), f'unsafe file name {name!r}')
        require(isinstance(checksum, str) and SHA.fullmatch(checksum), f'{name}: SHA-256 required')
        file = _plain_file(folder, name, MAX_FILE_BYTES)
        require(media.sha256(file) == checksum, f'{name}: SHA-256 mismatch')
        record['files'][name] = {'sha256': checksum, 'bytes': file.stat().st_size}
    require(isinstance(plan['variants'], dict) and set(plan['variants']) == {'1', '2', '3'}, 'variants 1, 2 and 3 required')
    for number, variant in plan['variants'].items():
        require(isinstance(variant, dict) and set(variant) == VARIANT_KEYS,
                f'variant {number}: keys must be exactly {sorted(VARIANT_KEYS)}')
        require(isinstance(variant['assembledSha256'], str) and SHA.fullmatch(variant['assembledSha256']),
                f'variant {number}: assembledSha256 required')
        for key in ('hookText', 'scriptText'):
            require(isinstance(variant[key], str) and variant[key].strip(), f'variant {number}: {key} required')
        require(isinstance(variant['montagePlan'], dict) and set(variant['montagePlan']) == {'events'} and
                isinstance(variant['montagePlan']['events'], list), f'variant {number}: montagePlan must hold only events')
        assets = variant['visualAssets']
        require(isinstance(assets, list), f'variant {number}: visualAssets list required')
        for asset in assets:
            require(isinstance(asset, dict) and set(asset) == ASSET_KEYS and asset['type'] == 'image' and
                    asset['file'] in files, f'variant {number}: asset must be an image listed in files')
        require(len({a['id'] for a in assets}) == len(assets), f'variant {number}: duplicate asset id')
    return plan, record


def check_parts(plan, topic_id, part_sha256):
    """The plan belongs to exactly these four originals and this topic."""
    require(plan['topicId'] == topic_id, 'topicId differs from the kit')
    require(plan['parts'] == {p: part_sha256[p] for p in PARTS}, 'parts differ from the kit originals (SHA-256)')


def _same(a, b):
    return math.isclose(a, b, abs_tol=EPSILON)


def _check_words(words, asr, number, boundary):
    """Every corrected word is one ASR word or a merge of consecutive ASR words; together they cover all of them.

    boundary: index of the first body ASR word; a merge never joins hook and body words.
    """
    require(isinstance(words, list) and words, f'variant {number}: wordTimings required')
    i = 0
    for word in words:
        require(isinstance(word, dict) and set(word) == {'text', 'start', 'end'} and isinstance(word['text'], str)
                and word['text'].strip(), f'variant {number}: word must have text/start/end')
        require(i < len(asr) and _same(word['start'], asr[i]['start']), f'variant {number}: word {word["text"]!r} not on ASR start')
        k = i
        while k < len(asr) and not _same(asr[k]['end'], word['end']):
            k += 1
        require(k < len(asr), f'variant {number}: word {word["text"]!r} not on ASR end')
        require(not i < boundary <= k, f'variant {number}: word {word["text"]!r} joins hook and body')
        i = k + 1
    require(i == len(asr), f'variant {number}: corrected words do not cover all ASR words')


def _body(variant, body_start):
    """Body words and events relative to the body start (time) and to the first body word (index)."""
    words = variant['wordTimings']
    first = next((i for i, w in enumerate(words) if w['start'] >= body_start - EPSILON), len(words))
    shift = lambda t: round(t - body_start, 6)
    body_words = [{**w, 'start': shift(w['start']), 'end': shift(w['end'])} for w in words[first:]]
    events = []
    for event in variant['montagePlan']['events']:
        # A hook event reaching into the body would change the shared part unseen by the comparison below.
        require(not (event.get('start', 0) < body_start - EPSILON and event.get('end', 0) > body_start + EPSILON),
                f"event {event.get('id')!r} crosses the hook/body boundary")
        if event.get('start', 0) >= body_start - EPSILON:
            moved = {**event, 'start': shift(event['start']), 'end': shift(event['end'])}
            for key in ('wordStart', 'wordEnd'):
                if key in moved:
                    moved[key] -= first
            events.append(moved)
    assets = sorted((a for a in variant['visualAssets'] if any(e.get('assetId') == a['id'] for e in events)),
                    key=lambda a: a['id'])
    return body_words, events, assets


def verify_copies(record, public_directory):
    """The PNG copies the renderer reads still have the confirmed hashes (checked before and after every render)."""
    for name, info in record['files'].items():
        copy = media.public_source(f'{public_directory}/{name}')
        require(media.sha256(copy) == info['sha256'], f'{name}: public copy SHA-256 mismatch')


def apply(plan, record, public_directory, manifest, jobs):
    """Returns ({hookNumber: job}, {hookNumber: montage plan}) built from the prepared jobs and the plan.

    jobs: [(job, evidence)] from prepare-assembled-jobs; public_directory holds the PNG copies (rr/incoming/...).
    """
    require(manifest.get('assemblyVersion') == '1.0.0', 'four-part source-set v1 only')
    by_number = {v['hookNumber']: v for v in manifest['variants']}
    require(set(by_number) == {1, 2, 3} and sorted(j['hookNumber'] for j, _ in jobs) == [1, 2, 3],
            'exactly three hook variants required')
    part_sha = {'body': None}
    for v in manifest['variants']:
        hook, body = v['parts']
        part_sha[f"h{v['hookNumber']}"] = hook['sha256']
        require(part_sha['body'] in (None, body['sha256']), 'variants use different body files')
        part_sha['body'] = body['sha256']
    check_parts(plan, manifest['topicId'], part_sha)
    verify_copies(record, public_directory)
    result_jobs, result_plans, bodies = {}, {}, {}
    for job, _ in jobs:
        number = job['hookNumber']
        variant, assembled = plan['variants'][str(number)], by_number[number]
        require(variant['assembledSha256'] == job['sourceVideo']['sha256'] == assembled['sha256'],
                f'variant {number}: assembled source SHA-256 differs')
        boundary = sum(w['start'] < assembled['bodyStart'] - EPSILON for w in job['wordTimings'])
        _check_words(variant['wordTimings'], job['wordTimings'], number, boundary)
        segments = variant['speechSegments']
        require(isinstance(segments, list) and len(segments) == len(job['speechSegments']) and
                all(isinstance(s, dict) and set(s) == {'text', 'start', 'end'} and isinstance(s['text'], str) and
                    _same(s['start'], a['start']) and _same(s['end'], a['end'])
                    for s, a in zip(segments, job['speechSegments'])), f'variant {number}: segments differ from ASR')
        assets = [{'id': a['id'], 'type': 'image', 'localPath': f"{public_directory}/{a['file']}",
                   'rightsReference': a['rightsReference']} for a in variant['visualAssets']]
        # Only the reviewed fields change; source, settings, mode and statuses stay those of the automatic job.
        edited = {**job, 'hookText': variant['hookText'], 'scriptText': variant['scriptText'],
                  'wordTimings': variant['wordTimings'], 'speechSegments': segments, 'visualAssets': assets}
        edited['scriptHash'] = contract.legacy_hash(edited)  # same hash rule as the prepared job, for the new text
        result_jobs[number], result_plans[number] = edited, {'events': variant['montagePlan']['events']}
        bodies[number] = _body(variant, assembled['bodyStart'])
    reference = bodies[1]
    for number in (2, 3):
        require(bodies[number] == reference, f'variant {number}: shared body or its montage differs from variant 1')
    return result_jobs, result_plans
