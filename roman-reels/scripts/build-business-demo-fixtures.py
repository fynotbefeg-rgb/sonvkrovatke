#!/usr/bin/env python3
"""Build synthetic local input files; no AI, email transport or network."""
import argparse
import hashlib
import io
import json
from decimal import Decimal
from email.message import EmailMessage
from email.policy import SMTPUTF8
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1] / 'research/business-automation-demo-v1'


def read_json(name):
    data = json.loads((ROOT / name).read_text())
    if data.get('synthetic') is not True:
        raise ValueError(f'Only explicitly synthetic fixtures allowed: {name}')
    return data


def money(value):
    return f'{Decimal(value):,.2f}'.replace(',', ' ').replace('.', ',')


def invoice_pdf(invoice):
    total = sum(Decimal(line['unitPrice']) * line['quantity'] for line in invoice['items'])
    if total != Decimal(invoice['total']):
        raise ValueError('Invoice arithmetic mismatch')
    if invoice['paymentDetails'] is not None:
        raise ValueError('Fixture must not include payment details')
    buffer = io.BytesIO()
    canvas = Canvas(buffer, pagesize=A4, invariant=1)
    canvas.setTitle(f"Учебный счёт {invoice['invoiceNumber']}")
    canvas.setAuthor('Codex — synthetic fixtures')
    style = ParagraphStyle('fixture', fontName='DemoSans', fontSize=11, leading=16)
    y = 790
    lines = [
        'УЧЕБНЫЙ ДОКУМЕНТ — НЕ ДЛЯ ОПЛАТЫ',
        'Все компании, услуги и суммы вымышлены.',
        f"Счёт: {invoice['invoiceNumber']}",
        f"Дата: {invoice['issuedOn']} | Срок: {invoice['dueOn']}",
        f"Поставщик: {invoice['supplier']}",
        f"Покупатель: {invoice['buyer']}",
        f"Валюта: {invoice['currency']}",
    ]
    for i, item in enumerate(invoice['items'], 1):
        lines.extend([
            f"{i}. {item['description']}",
            f"Количество: {item['quantity']}; цена: {money(item['unitPrice'])}; "
            f"сумма: {money(Decimal(item['unitPrice']) * item['quantity'])} {invoice['currency']}",
        ])
    lines.extend([
        f"ИТОГО: {money(invoice['total'])} {invoice['currency']}",
        'Налог: не указан. Банковские и налоговые реквизиты отсутствуют.',
        'Нельзя отправлять на оплату. После извлечения полей нужна проверка человеком.',
    ])
    for text in lines:
        paragraph = Paragraph(escape(text), style)
        _, height = paragraph.wrap(475, 700)
        y -= height
        if y < 60:
            raise ValueError('Fixture does not fit one page')
        paragraph.drawOn(canvas, 60, y)
        y -= 12
    canvas.showPage()
    canvas.save()
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', type=Path,
                        default=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    args = parser.parse_args()
    pdfmetrics.registerFont(TTFont('DemoSans', str(args.font)))
    lead = read_json('lead/input.json')
    invoices = read_json('invoices/input.json')
    proposal = read_json('proposal/input.json')
    prices = read_json('proposal/price-book.json')
    expected = read_json('expected-results.json')
    if expected['workflowTested'] or expected['modelCalled'] or expected['scriptApproved']:
        raise ValueError('Prepared fixture must not claim pipeline execution or approval')
    total = sum(Decimal(p['unitPrice']) * p['quantity'] for p in prices['items']
                if p['serviceId'] in proposal['selectedServiceIds'])
    if total != Decimal(expected['proposal']['expectedTotal']):
        raise ValueError('Proposal price-book mismatch')
    message = EmailMessage(policy=SMTPUTF8)
    message['From'] = f"{lead['from']['name']} <{lead['from']['email']}>"
    message['To'] = lead['to']
    message['Subject'] = lead['subject']
    message['Message-ID'] = lead['messageId']
    message['Date'] = 'Sat, 10 Oct 2026 09:00:00 +0000'
    message['X-Roman-Demo-Synthetic'] = 'true'
    message['X-Roman-Do-Not-Send'] = 'true'
    message.set_content(lead['body'])
    outputs = {'lead/request.eml': message.as_bytes()}
    for invoice in invoices['invoices']:
        outputs[f"invoices/{invoice['fixtureId']}.pdf"] = invoice_pdf(invoice)
    outputs['invoices/invoice-001-replay.pdf'] = outputs['invoices/invoice-001.pdf']
    inputs = ['lead/input.json', 'invoices/input.json', 'proposal/input.json',
              'proposal/price-book.json', 'proposal/template.md', 'expected-results.json']
    payloads = {name: (ROOT / name).read_bytes() for name in inputs} | outputs
    manifest = {
        'fixtureVersion': '1.0.0', 'synthetic': True, 'status': 'fixtures_prepared',
        'workflowTested': False, 'modelCalled': False, 'topicApproved': False,
        'scriptApproved': False, 'productionReady': False,
        'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in payloads.items()},
        'duplicateOf': {'invoices/invoice-001-replay.pdf': 'invoices/invoice-001.pdf'},
        'limitations': ['Expected values are an oracle, not model results.',
                        'Text-layer PDFs; no OCR/scanned-document test.',
                        'No n8n, Gmail, CRM, Gemini or Google Slides integration executed.'],
    }
    outputs['manifest.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
    # Check all destinations before writing any file; preserve existing differing data.
    for name, data in outputs.items():
        path = ROOT / name
        if path.exists() and path.read_bytes() != data:
            raise FileExistsError(f'Refusing to replace differing fixture: {path}')
    for name, data in outputs.items():
        path = ROOT / name
        if not path.exists():
            path.write_bytes(data)
    print('Prepared local EML, 2 invoices + exact replay, and SHA-256 manifest. No API calls.')


if __name__ == '__main__':
    main()
