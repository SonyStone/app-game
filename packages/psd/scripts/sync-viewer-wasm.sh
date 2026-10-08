#!/bin/sh
# Copies the viewer module built by photoshop-analysis/psd-wasm/scripts/build.sh (pkg-viewer/: the codec with document
# handles, compositing and comparisons) into wasm-viewer/ and records hashes. The flat codec in wasm/ is synced
# separately by sync-wasm.sh, so Paint's PSD import keeps its small module.
set -e
cd "$(dirname "$0")/.."
source=../../../photoshop-analysis/psd-wasm/pkg-viewer
mkdir -p wasm-viewer
for file in photoshop_psd_viewer.js photoshop_psd_viewer.d.ts photoshop_psd_viewer_bg.wasm photoshop_psd_viewer_bg.wasm.d.ts; do
  cp "$source/$file" wasm-viewer/
done
(cd wasm-viewer && shasum -a 256 photoshop_psd_viewer* > manifest.sha256)
cat wasm-viewer/manifest.sha256
