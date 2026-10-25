"""Prepares a plain local kit (four MP4 + kit.json) for the bot's existing /intake_local.

The kit is assembled in a hidden temporary folder inside the configured inbox (its name starts with '.', so the
bot's listing never shows it) and becomes a visible kit folder by one rename only after every copy matched its
source by SHA-256 and kit.json was written. Sources are only read; on any error only this operation's temporary
folder is removed. No editorial plan, Telegram, ASR or render here.
"""
import hashlib
import json
import os
import re
import shutil
import sys
import uuid
from datetime import datetime
from pathlib import Path

ROLES = {'body': 'Основа', 'h1': 'Хук 1', 'h2': 'Хук 2', 'h3': 'Хук 3'}
FILES = {'body': 'body.mp4', 'h1': 'hook-1.mp4', 'h2': 'hook-2.mp4', 'h3': 'hook-3.mp4'}
TOPIC = re.compile(r'^[a-z0-9][a-z0-9_-]{0,63}$')  # same rules as the bot's kit.json topicId
KIT = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')  # folders the bot lists
MAX_BYTES = 4 * 1024 ** 3
CHUNK = 1024 * 1024
REPO = Path(__file__).resolve().parents[2]
DONE = 'Комплект подготовлен. Открой /intake_local в боте.'


def configured_inbox():
    """The inbox the bot reads: %LOCALAPPDATA%\\RomanReels\\telegram-inbox on Windows, else ROMAN_TELEGRAM_INBOX_DIR."""
    if sys.platform == 'win32':
        return Path(os.environ['LOCALAPPDATA']) / 'RomanReels' / 'telegram-inbox'
    value = os.environ.get('ROMAN_TELEGRAM_INBOX_DIR', '')
    if not value:
        raise ValueError('Папка входящих комплектов не настроена (ROMAN_TELEGRAM_INBOX_DIR)')
    return Path(value)


def check_form(topic, sources):
    """Errors of the window's fields; an empty list means the kit can be prepared."""
    errors = []
    if not topic:
        errors.append('Укажи тему комплекта')
    elif not TOPIC.fullmatch(topic):
        errors.append('Тема: строчные латинские буквы, цифры, «-» и «_», например roman-seo-02')
    for role, label in ROLES.items():
        if not sources.get(role):
            errors.append(f'Не выбран файл: {label}')
    return errors


def _source(role, value):
    file = Path(value)
    label = ROLES[role]
    if not file.is_absolute():
        raise ValueError(f'{label}: нужен полный путь к файлу')
    if file.is_symlink() or not file.is_file():
        raise ValueError(f'{label}: файл не найден или это не обычный файл')
    if file.suffix.lower() != '.mp4':
        raise ValueError(f'{label}: нужен файл MP4')
    size = file.stat().st_size
    if not 0 < size <= MAX_BYTES:
        raise ValueError(f'{label}: размер вне допустимого (до 4 ГБ)')
    return file


def _copy(source, target):
    """Copies with a hash of the bytes read; the source must not change during the copy."""
    before = source.stat()
    if not 0 < before.st_size <= MAX_BYTES:  # checked again: the file may have changed while earlier roles were copied
        raise ValueError(f'{source.name}: размер вне допустимого (до 4 ГБ)')
    digest = hashlib.sha256()
    written = 0
    with source.open('rb') as reader, target.open('xb') as writer:
        while chunk := reader.read(CHUNK):
            digest.update(chunk)
            writer.write(chunk)
            written += len(chunk)
    after = source.stat()
    if written != before.st_size:
        raise ValueError(f'{source.name}: скопировано не столько байтов, сколько в исходнике')
    copied = hashlib.sha256()
    with target.open('rb') as reader:
        while chunk := reader.read(CHUNK):
            copied.update(chunk)
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns) or copied.hexdigest() != digest.hexdigest():
        raise ValueError(f'{source.name}: копия не совпала по SHA-256 с исходником (файл менялся во время копирования)')
    return {'bytes': after.st_size, 'sha256': digest.hexdigest()}


def _kit_name(inbox, topic, now):
    base = f"{topic[:44]}-{now.strftime('%Y%m%d-%H%M%S')}"
    for n in range(1, 100):
        name = base if n == 1 else f'{base}-{n}'
        if KIT.fullmatch(name) and not (inbox / name).exists():
            return name
    raise ValueError('Не удалось подобрать новое имя папки комплекта')


def prepare(topic, sources, inbox=None, now=None):
    """Creates <inbox>/<topic>-<time>/ with body.mp4, hook-1..3.mp4 and kit.json; returns the result."""
    errors = check_form(topic, sources)
    if errors:
        raise ValueError('; '.join(errors))
    inbox = Path(inbox) if inbox is not None else configured_inbox()
    if not inbox.is_absolute() or inbox.is_symlink() or not inbox.is_dir():
        raise ValueError(f'Папка входящих комплектов не найдена: {inbox}')
    inbox = inbox.resolve()
    if inbox == REPO or inbox.is_relative_to(REPO):
        raise ValueError('Папка входящих комплектов должна быть вне Git')
    files = {role: _source(role, sources[role]) for role in ROLES}
    roles = list(files)
    for i, a in enumerate(roles):
        for b in roles[i + 1:]:
            if os.path.samefile(files[a], files[b]):
                raise ValueError(f'Один и тот же файл выбран для ролей «{ROLES[a]}» и «{ROLES[b]}»')
    name = _kit_name(inbox, topic, now or datetime.now())
    temporary = inbox / f'.preparing-{name}-{uuid.uuid4().hex[:8]}'
    temporary.mkdir()
    try:
        parts = {}
        for role, source in files.items():
            parts[role] = {'name': FILES[role], 'source': str(source), **_copy(source, temporary / FILES[role])}
        manifest = {'topicId': topic, 'parts': {role: FILES[role] for role in ROLES}}
        with (temporary / 'kit.json').open('x', encoding='utf-8') as stream:
            stream.write(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        final = inbox / name
        if final.exists():
            raise ValueError(f'Папка {name} уже существует; ничего не перезаписано')
        # The kit becomes visible to the bot only now. On Windows the rename fails if the target exists; on POSIX it
        # could only replace an empty folder created in the instant after the check above (no data is lost).
        os.rename(temporary, final)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    return {'kit': name, 'path': str(final), 'topicId': topic, 'parts': parts}
