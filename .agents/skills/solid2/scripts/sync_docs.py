#!/usr/bin/env python3
"""Bundle Solid's complete published Markdown export with local navigation."""

import argparse
import hashlib
import json
import posixpath
import re
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import Request, urlopen


def main():
    """Refresh the owned snapshot files, or validate an existing snapshot offline."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Validate offline; do not download or write.')
    parser.add_argument('--index', type=Path, help='Use a saved official llms.txt export.')
    parser.add_argument('--corpus', type=Path, help='Use a saved official llms-full.txt export.')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    if args.check:
        validate(root)
        return
    index = args.index.read_bytes() if args.index else fetch(ORIGIN + '/llms.txt')
    corpus = args.corpus.read_bytes() if args.corpus else fetch(ORIGIN + '/llms-full.txt')
    pages = parse_export(index.decode(), corpus.decode())
    aliases = {}
    for page in pages:
        page['source_path'] = page['path']
        page['path'] = local_path(page['source_path'])
        aliases[page['route']] = page['path']
        aliases['/' + page['source_path']] = page['path']
        aliases['/' + page['source_path'].removesuffix('.md')] = page['path']
    aliases['/'] = 'references/overview/index.md'
    if len({page['path'].casefold() for page in pages}) != len(pages):
        raise ValueError('Documentation filenames collide')
    assets = {}
    unresolved = set()

    def localize(target, current):
        url = urlsplit(urljoin(ORIGIN + current['route'], target))
        if url.hostname not in DOC_HOSTS or target.startswith('#'):
            return target
        route = unquote(url.path).rstrip('/') or '/'
        destination = aliases.get(route)
        if destination is None and route.startswith('/images/'):
            destination = 'assets/' + route.removeprefix('/images/').replace('/', '-')
            assets[route] = destination
        if destination is None:
            unresolved.add((current['path'], target))
            return target
        relative = posixpath.relpath(destination, posixpath.dirname(current['path']) or '.')
        return relative + ('#' + url.fragment if url.fragment else '')

    files = {}
    for page in pages:
        body = transform_links(page.pop('body'), lambda target: localize(target, page))
        files[page['path']] = (f"# {page['title']}\n\n" + body.strip() + '\n').encode()
    if unresolved:
        raise ValueError(f'Unmapped Solid documentation links: {sorted(unresolved)}')
    for route, destination in sorted(assets.items()):
        files[destination] = fetch(ORIGIN + route)

    files['references/index.md'] = page_index(pages).encode()
    manifest = {
        'captured_at': datetime.now(timezone.utc).isoformat(),
        'index_url': ORIGIN + '/llms.txt',
        'corpus_url': ORIGIN + '/llms-full.txt',
        'index_sha256': digest(index),
        'corpus_sha256': digest(corpus),
        'page_count': len(pages),
        'pages': pages,
        'assets': assets,
        'files': {path: digest(data) for path, data in sorted(files.items())},
    }
    if len({path.casefold() for path in files}) != len(files):
        raise ValueError('Snapshot paths collide on a case-insensitive filesystem')
    manifest_path = root / 'references' / 'manifest.json'
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for path, data in files.items():
        output = safe_path(root, path)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
    # Remove only files listed in the previous snapshot, never handwritten notes.
    new_names = {path.casefold() for path in files}
    for stale in set(old.get('files', {})) - files.keys():
        if stale.casefold() not in new_names:
            safe_path(root, stale).unlink(missing_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    validate(root)


def parse_export(index, corpus):
    """Require a one-to-one match between the official index and corpus."""
    entries = re.findall(r'^- \[([^\]]+)\]\(([^)]+\.md)\)(?:: (.*))?$', index, re.M)
    sections = list(re.finditer(r'^# ([^\n]+)\n\nSource: (https?://\S+)\n\n', corpus, re.M))
    bodies = {}
    for number, section in enumerate(sections):
        end = sections[number + 1].start() if number + 1 < len(sections) else len(corpus)
        body = corpus[section.end():end].rstrip()
        if number + 1 < len(sections):
            if not body.endswith('\n---'):
                raise ValueError('Unexpected corpus section delimiter')
            body = body[:-4].rstrip()
        path = unquote(urlsplit(section[2]).path).lstrip('/')
        if path in bodies:
            raise ValueError(f'Duplicate corpus page: {path}')
        bodies[path] = (section[1], body)
    pages = []
    for title, url, description in entries:
        path = unquote(urlsplit(url).path).lstrip('/')
        safe_path(Path('/snapshot'), path)
        if path not in bodies or bodies[path][0] != title:
            raise ValueError(f'Index/corpus mismatch: {title}, {path}')
        route = '/' + path.removesuffix('.md')
        if route.endswith('/index'):
            route = route[:-6] or '/'
        pages.append({'title': title, 'path': path, 'route': route,
                      'description': description, 'source_url': url, 'body': bodies[path][1]})
    if not pages or len({p['path'] for p in pages}) != len(pages) or len(pages) != len(bodies):
        raise ValueError('The export is empty, duplicated, or incomplete')
    return pages


def transform_links(text, transform):
    """Rewrite Markdown destinations while leaving fenced code examples intact."""
    lines = []
    fence = None
    for line in text.splitlines(keepends=True):
        marker = re.match(r'^\s*(`{3,}|~{3,})', line)
        if marker:
            value = marker[1]
            if fence is None:
                fence = value
            elif value[0] == fence[0] and len(value) >= len(fence):
                fence = None
            lines.append(line)
            continue
        if fence is None:
            line = re.sub(r'(\]\()([^\s)]+)(\))',
                          lambda m: m[1] + transform(m[2]) + m[3], line)
            line = re.sub(r'^(\s*\[[^\]]+\]:\s*)(\S+)',
                          lambda m: m[1] + transform(m[2]), line)
        lines.append(line)
    if fence:
        raise ValueError('Unclosed code fence in upstream export')
    return ''.join(lines)


def validate(root):
    """Verify page coverage, content hashes, local destinations, and navigation."""
    manifest = json.loads((root / 'references' / 'manifest.json').read_text())
    if manifest['page_count'] != len(manifest['pages']):
        raise ValueError('Manifest page count mismatch')
    paths = {page['path'] for page in manifest['pages']}
    if len(paths) != manifest['page_count']:
        raise ValueError('Duplicate page paths')
    for relative, expected in manifest['files'].items():
        path = safe_path(root, relative)
        if digest(path.read_bytes()) != expected:
            raise ValueError(f'Changed or missing generated file: {relative}')
        if path.suffix != '.md':
            continue
        def check_link(target):
            url = urlsplit(target)
            if url.scheme or url.netloc:
                if url.hostname in DOC_HOSTS:
                    raise ValueError(f'Unconverted internal link: {relative}: {target}')
                return target
            if url.path and not (path.parent / unquote(url.path)).is_file():
                raise ValueError(f'Missing local link: {relative}: {target}')
            return target
        transform_links(path.read_text(), check_link)
    index = (root / 'references' / 'index.md').read_text()
    for relative in paths:
        if index.count(f"]({posixpath.relpath(relative, 'references')})") != 1:
            raise ValueError(f'Expected exactly one navigation entry: {relative}')
        if len(PurePosixPath(relative).parts) != 3:
            raise ValueError(f'Unexpected documentation nesting: {relative}')
    print(f"Validated {len(paths)} documentation pages, {len(manifest['assets'])} assets, "
          'and one navigation index.')


def local_path(source):
    """Keep one directory per topic/package, with readable collision-free names."""
    parts = PurePosixPath(source).parts
    if len(parts) == 1:
        return 'references/overview/' + source
    if parts[0] != 'reference':
        return 'references/' + parts[0] + '/' + '-'.join(parts[1:])
    package = parts[1].removesuffix('.md')
    group = PACKAGE_GROUPS[package]
    name = parts[-1] if len(parts) > 2 else 'overview.md'
    if source == 'reference/solid-js/advanced/jsx-component-primitives/repeat.md':
        name = 'repeat-primitive.md'
    return f'references/{group}/{name}'


def page_index(pages):
    """List each page once; preserve conceptual groups without directory nesting."""
    lines = ['# Documentation index', '',
             'Complete Solid 2 documentation. Each page appears once below.', '',
             'Attribution: Solid documentation authors and contributors, solidjs/solid-docs.',
             'Original prose, examples, tables, callouts, and diagrams are preserved; internal links point to local copies.',
             'Capture metadata and content hashes are in `manifest.json`. Generated pages and this index are maintained by `scripts/sync_docs.py`.', '']
    previous = None
    subgroup = None
    order = {group: index for index, group in enumerate(GROUP_TITLES)}
    for page in sorted(pages, key=lambda p: order[PurePosixPath(p['path']).parts[1]]):
        group = PurePosixPath(page['path']).parts[1]
        if group != previous:
            lines.extend(['', '## ' + GROUP_TITLES[group], ''])
            previous, subgroup = group, None
        source = PurePosixPath(page['source_path']).parts
        section = source[-2] if group in ('core', 'web') and len(source) > 3 else None
        if group == 'web' and len(source) == 3:
            section = PurePosixPath(source[-1]).stem
        if section and section != subgroup:
            lines.extend(['', '### ' + section.replace('-', ' ').capitalize(), ''])
            subgroup = section
        target = posixpath.relpath(page['path'], 'references')
        lines.append(f"- [{page['title']}]({target}): {page['description']}")
    return '\n'.join(lines) + '\n'


def safe_path(root, relative):
    """Reject absolute paths and traversal from remote index or saved metadata."""
    path = PurePosixPath(relative)
    if path.is_absolute() or '..' in path.parts or '\\' in relative:
        raise ValueError(f'Unsafe snapshot path: {relative}')
    return root / path


def fetch(url):
    """Fetch the official agent export or one of its referenced diagrams."""
    request = Request(url, headers={'User-Agent': 'Mozilla/5.0 (Solid2 local documentation snapshot)'})
    with urlopen(request, timeout=30) as response:
        return response.read()


def digest(data):
    return hashlib.sha256(data).hexdigest()


PACKAGE_GROUPS = {
    'solid-js': 'core', 'solid-web': 'web', 'solid-router': 'router',
    'solid-meta': 'meta', 'vite-plugin-solid': 'vite', 'filesystem-routing': 'filesystem',
}
GROUP_TITLES = {
    'overview': 'Overview', 'getting-started': 'Getting started', 'concepts': 'Concepts',
    'building-apps': 'Building apps', 'routing': 'Routing guides', 'guides': 'Guides',
    'migration': 'Migration', 'core': 'Core API', 'web': 'Web API', 'router': 'Router API',
    'meta': 'Metadata API', 'vite': 'Vite API', 'filesystem': 'Filesystem routing API',
}
ORIGIN = 'https://v2.solidjs.com'
DOC_HOSTS = {'v2.solidjs.com', 'v2-rebuild--solid-docs-v2.netlify.app'}


if __name__ == '__main__':
    main()
