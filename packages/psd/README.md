# PSD

Reads and writes layered Photoshop documents: 8-bit RGB raster layers with transparency, PackBits-compressed, without a UI or browser dependency. Paint's bridge to its tiles is `paint-core/src/psdFile.ts`.

- `writePsd(document, composite)` writes the layers, each with straight RGBA pixels, offset, opacity, visibility, blend mode (Normal, Multiply, Screen, Overlay), clipping and transparency lock, and the flattened `composite` for programs that read no layers. Names are stored as Pascal strings and as Unicode (`luni`).
- `readPsd(bytes)` reads the same, raw or RLE: groups are flattened into their layers, masks and unknown blend modes are ignored (the latter as Normal), and a document without layers becomes one layer of its flattened image. PSB, ZIP-compressed layers, other bit depths and color modes throw readable errors.

## Verification

```sh
pnpm --filter @app-game/psd exec tsc --noEmit
pnpm --filter @app-game/psd exec vitest run
```
