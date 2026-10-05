# PSD

Reads and writes layered Photoshop documents as flat lists of 8-bit RGBA raster layers, without a UI or browser dependency. The codec is Rust compiled to WebAssembly, built in `photoshop-analysis/psd-wasm` from the `photoshop-psd` crate (`photoshop-analysis/psd-rs`), which parses PSD and PSB losslessly and is checked byte for byte against 759 files of other libraries' test suites. Paint's bridge to its tiles is `paint-core/src/psdFile.ts`.

- `readPsd(bytes)` reads PSD and PSB in RGB, Grayscale and Bitmap at 1, 8, 16 and 32 bits, raw, RLE or ZIP-compressed. Groups are flattened into their layers: a layer is visible only when its groups are, and their opacity multiplies its own. Masks, layer effects, adjustment layers and text are not rendered yet. A document without layers becomes one layer of its flattened image. CMYK, Lab, Indexed, Duotone and Multichannel documents throw.
- `writePsd(document, composite)` writes 8-bit RGB layers with transparency, PackBits-compressed, with name (Unicode `luni` and Mac Roman), offset, opacity, fill, visibility, any Photoshop blend mode, clipping and transparency lock, and the flattened `composite` for programs that read no layers. Canvases over 30,000 pixels on a side become PSB.

Both are asynchronous: the first call loads the WASM module (browsers fetch it, Node reads it from disk). `loadPsd(input?)` preloads it or supplies the module explicitly.

16-bit samples are scaled to 8 bits by 255/65535 and 32-bit linear samples are encoded with the sRGB curve; both are provisional until checked against Photoshop.

## Updating the codec

```sh
../../../photoshop-analysis/psd-wasm/scripts/build.sh
./scripts/sync-wasm.sh
```

## Verification

```sh
pnpm --filter @app-game/psd exec tsc --noEmit
pnpm --filter @app-game/psd exec vitest run
```
