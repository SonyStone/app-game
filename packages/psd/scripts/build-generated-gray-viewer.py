#!/usr/bin/env python3
"""Build the pinned viewer with original generated Dot Gain profiles admitted to the measured Gray route.

Usage: python3 scripts/build-generated-gray-viewer.py /path/to/photoshop-analysis
The research checkout is read only. All patched source and Cargo output live in a temporary directory.
"""
import io
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile


def build(source: str) -> None:
    """Apply the finite operand admission to a temporary source snapshot and update the committed viewer."""
    revision = '9f9f73e9d75679a35228b00468cc54aa0bc4d5d6'
    original = '36e45d8233e46507c30d93d594d3a1310cc9438cd5bb2b86ffea8a52e5dd9d18'
    generated = 'f45efa5dcc28302290d20e00e54867b150a9f58761ba33edaa2d0da07850f5c8'
    package = Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix='psd-generated-gray-') as temporary:
        root = Path(temporary)
        paths = [f'{crate}/{part}' for crate in ('psd-rs', 'abr-rs', 'psd-wasm') for part in ('src', 'Cargo.toml', 'Cargo.lock')]
        # Only tracked sources are read; no build writes reach the research checkout.
        archive = subprocess.check_output(['git', '-C', source, 'archive', revision, '--', *paths])
        with tarfile.open(fileobj=io.BytesIO(archive)) as snapshot:
            snapshot.extractall(root, filter='data')
        ace = root / 'psd-rs/src/cms/ace.rs'
        text = ace.read_text()
        needle = f'| "{original}"'
        assert text.count(needle) == 1, 'Pinned Gray dispatch changed'
        text = text.replace(needle, f'{needle}\n                | "{generated}"')
        text = text.replace('source_sha256.starts_with("36e45d"),', f'source_sha256 == "{original}" || source_sha256 == "{generated}",')
        ace.write_text(text)
        crate = root / 'psd-wasm'
        subprocess.run(['cargo', '+1.92.0', 'build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '--features', 'viewer'], cwd=crate, check=True)
        subprocess.run(['wasm-bindgen', '--target', 'web', '--out-dir', str(root / 'output'), '--out-name', 'photoshop_psd_viewer', str(crate / 'target/wasm32-unknown-unknown/release/photoshop_psd_wasm.wasm')], check=True)
        for name in ('photoshop_psd_viewer.js', 'photoshop_psd_viewer.d.ts', 'photoshop_psd_viewer_bg.wasm', 'photoshop_psd_viewer_bg.wasm.d.ts'):
            shutil.copyfile(root / 'output' / name, package / 'wasm-viewer' / name)
        names = sorted(path.name for path in (package / 'wasm-viewer').glob('photoshop_psd_viewer*'))
        manifest = subprocess.check_output(['shasum', '-a', '256', *names], cwd=package / 'wasm-viewer')
        (package / 'wasm-viewer/manifest.sha256').write_bytes(manifest)


if __name__ == '__main__':
    build(sys.argv[1])
