"""Compare independent page renders; keep visual findings distinct from execution success.

Requires Pillow and NumPy. Run after run.browser.mjs; use --check for the reviewed baseline.
"""

import argparse
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('results', type=Path)
    parser.add_argument('--check', type=Path)
    parser.add_argument('--write-baseline', type=Path)
    args = parser.parse_args()
    report = json.loads((args.results / 'render-report.json').read_text())
    pdfjs_metadata = args.results / 'pdfjs-reference.json'
    report['pdfjsReference'] = json.loads(pdfjs_metadata.read_text()) if pdfjs_metadata.exists() else None
    report['comparison'] = {
        'threshold': 24,
        'neighborhood': 1,
        'note': 'Within tolerance is a screening result, not proof of PDF conformance. '
                'Poppler uses its default display color management; renderer/profile differences need manual review.'
    }

    for case in report['cases']:
        if case['status'] != 'rendered':
            continue

        folder = args.results / case['id']
        for page in case['pages']:
            number = page['number']
            actual = Image.open(folder / f'{number}-actual.png').convert('RGB')
            reference_kind = 'pdfjs' if case.get('reference') == 'pdfjs' else 'reference'
            reference = Image.open(folder / f'{number}-{reference_kind}.png').convert('RGB')
            reopened = Image.open(folder / f'{number}-reopened.png').convert('RGB')
            page['metrics'] = compare(actual, reference)
            pdfjs_image = folder / f'{number}-pdfjs.png'
            if pdfjs_image.exists():
                page['pdfjsMetrics'] = compare(actual, Image.open(pdfjs_image).convert('RGB'))
            page['reference'] = case.get('reference', 'poppler')
            page['reopenExact'] = actual.size == reopened.size and np.array_equal(np.asarray(actual), np.asarray(reopened))
            page['status'] = 'within-tolerance' if (
                page['metrics']['tolerantChangedPercent'] <= 0.5
                and page['metrics']['foregroundChangedPercent'] <= 3
                and page['metrics']['blurredMeanError'] <= 2
            ) else 'visual-difference'
            delta = np.abs(np.asarray(actual, dtype=np.int16) - np.asarray(reference, dtype=np.int16))
            Image.fromarray(np.minimum(delta * 3, 255).astype(np.uint8)).save(folder / f'{number}-difference.png')

        case['status'] = 'reopen-mismatch' if not all(p['reopenExact'] for p in case['pages']) else (
            'visual-difference' if any(p['status'] == 'visual-difference' for p in case['pages']) else 'within-tolerance'
        )

    report['counts'] = {status: sum(c['status'] == status for c in report['cases']) for status in sorted({c['status'] for c in report['cases']})}
    (args.results / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    (args.results / 'index.html').write_text(render_html(report))
    print(json.dumps(report['counts'], indent=2))
    print(args.results / 'index.html')

    if args.write_baseline:
        args.write_baseline.write_text(json.dumps(make_baseline(report), indent=2) + '\n')

    if args.check:
        failures = check_baseline(report, json.loads(args.check.read_text()))
        for failure in failures:
            print('REGRESSION:', failure)
        raise SystemExit(1 if failures else 0)


def compare(actual, reference):
    """Report raw error and symmetric nearest-neighbor error within one pixel to reduce AA noise."""
    if actual.size != reference.size:
        raise ValueError(f'Different image dimensions: {actual.size} vs {reference.size}')

    a = np.asarray(actual, dtype=np.int16)
    b = np.asarray(reference, dtype=np.int16)
    delta = np.abs(a - b)
    changed = np.maximum(neighbor_error(a, b), neighbor_error(b, a)) > 24
    foreground = (a.min(axis=2) < 245) | (b.min(axis=2) < 245)
    blurred = np.abs(
        np.asarray(actual.filter(ImageFilter.GaussianBlur(0.7)), dtype=np.int16)
        - np.asarray(reference.filter(ImageFilter.GaussianBlur(0.7)), dtype=np.int16)
    )
    return {
        'meanError': float(delta.mean()),
        'maxError': int(delta.max()),
        'rawChangedPercent': float((delta.max(axis=2) > 24).mean() * 100),
        'tolerantChangedPercent': float(changed.mean() * 100),
        'foregroundChangedPercent': float((changed & foreground).sum() / max(1, foreground.sum()) * 100),
        'blurredMeanError': float(blurred.mean())
    }


def neighbor_error(a, b):
    padded = np.pad(b, ((1, 1), (1, 1), (0, 0)), constant_values=255)
    best = np.full(a.shape[:2], 255, dtype=np.int16)
    for y in range(3):
        for x in range(3):
            nearby = padded[y:y + a.shape[0], x:x + a.shape[1]]
            best = np.minimum(best, np.abs(a - nearby).max(axis=2))
    return best


def make_baseline(report):
    """Known differences remain explicit; the baseline never reclassifies them as passing PDF support."""
    return {
        'pdfjsRevision': report['pdfjsRevision'],
        'pdfjsReference': report.get('pdfjsReference'),
        'cases': [{
            'id': c['id'], 'sha256': c['sha256'], 'status': c['status'],
            'error': c.get('error'),
            'reference': c.get('reference', 'poppler'),
            'pages': [{k: p[k] for k in ('number', 'status', 'metrics', 'reopenExact') if k in p} for p in c.get('pages', [])]
        } for c in report['cases']]
    }


def check_baseline(report, baseline):
    expected = {c['id']: c for c in baseline['cases']}
    failures = []
    if (report.get('pdfjsReference') or {}).get('version') != (baseline.get('pdfjsReference') or {}).get('version'):
        failures.append('PDF.js reference version changed; review required')
    actual_ids = {c['id'] for c in report['cases']}
    if actual_ids != set(expected):
        failures.append('Case set differs from baseline; run the complete pinned corpus')

    for case in report['cases']:
        before = expected.get(case['id'])
        if not before:
            continue
        if case.get('reference', 'poppler') != before.get('reference', 'poppler'):
            failures.append(f"{case['id']}: primary reference changed")
        if case['sha256'] != before['sha256']:
            failures.append(f"{case['id']}: input changed")
        if case['status'] in ('harness-error', 'reopen-mismatch') or case['status'] != before['status']:
            failures.append(f"{case['id']}: {before['status']} -> {case['status']}; review required")
        if case.get('error') != before.get('error'):
            failures.append(f"{case['id']}: error changed")
        old_pages = {p['number']: p for p in before['pages']}
        if set(old_pages) != {p['number'] for p in case.get('pages', [])}:
            failures.append(f"{case['id']}: page coverage changed")
        for page in case.get('pages', []):
            old = old_pages.get(page['number'])
            if not old or 'metrics' not in page:
                continue
            for metric in ('tolerantChangedPercent', 'foregroundChangedPercent', 'blurredMeanError'):
                if page['metrics'][metric] > old['metrics'][metric] * 1.25 + 0.15:
                    failures.append(f"{case['id']} p{page['number']}: {metric} increased")
    return failures


def render_html(report):
    escape = lambda value: html.escape(str(value))
    rows = []
    for case in report['cases']:
        pages = []
        for page in case.get('pages', []):
            prefix = f"{case['id']}/{page['number']}"
            pages.append(f'''<details><summary>Page {page['number']} · {escape(page.get('status'))} ·
                difference vs {escape(page.get('reference', 'poppler'))} {page.get('metrics', {}).get('tolerantChangedPercent', 0):.3f}% ·
                GDOC exact: {page.get('reopenExact')}</summary>
                <div class="images">{''.join(f'<figure><figcaption>{label}</figcaption><a href="{prefix}-{kind}.png"><img loading="lazy" src="{prefix}-{kind}.png"></a></figure>' for kind, label in [('reference', 'Poppler'), ('pdfjs', 'PDF.js'), ('actual', 'TypeGPU'), ('difference', 'Difference ×3')])}</div>
                <pre>{escape(json.dumps(page.get('metrics', {}), indent=2))}</pre></details>''')
        rows.append(f'''<section><h2>{escape(case['id'])}</h2><p>{escape(case['topic'])} · <b>{escape(case['status'])}</b>
            · <a href="{escape(case.get('localSource') or case['url'])}">Source PDF</a></p>
            <pre>{escape(case.get('error') or '')}</pre>{''.join(pages)}</section>''')
    return f'''<!doctype html><html lang="en"><meta charset="utf-8"><title>PDF rendering compatibility</title>
    <style>body{{font:15px system-ui;margin:32px;background:#f4f5f7;color:#20242c}}section{{background:white;padding:20px;margin:16px 0;border-radius:8px}}h2{{font-size:18px}}summary{{cursor:pointer;padding:12px}}.images{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}}figure{{margin:0}}img{{width:100%}}pre{{white-space:pre-wrap}}a{{color:#245acc}}</style>
    <h1>PDF rendering compatibility</h1><p>{escape(report['createdAt'])} · {escape(report['poppler'])} · Chromium {escape(report['chromium'])}</p>
    <p>{escape(report['comparison']['note'])}</p><pre>{escape(json.dumps(report['counts'], indent=2))}</pre>
    <h2>Sources not tested</h2><pre>{escape(json.dumps(report['blockedSources'], indent=2))}</pre>{''.join(rows)}</html>'''


if __name__ == '__main__':
    main()
