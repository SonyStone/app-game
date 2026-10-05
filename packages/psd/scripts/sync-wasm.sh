#!/bin/sh
# Copies the Rust/WASM codec built by photoshop-analysis/psd-wasm/scripts/build.sh into wasm/ and records hashes.
set -e
cd "$(dirname "$0")/.."
source=../../../photoshop-analysis/psd-wasm/pkg
for file in photoshop_psd_wasm.js photoshop_psd_wasm.d.ts photoshop_psd_wasm_bg.wasm photoshop_psd_wasm_bg.wasm.d.ts; do
  cp "$source/$file" wasm/
done
(cd wasm && shasum -a 256 photoshop_psd_wasm* > manifest.sha256)
cat wasm/manifest.sha256
