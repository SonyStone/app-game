# Paint experiments

Legacy drawing experiments used by the web playground, published within the
workspace as `@app-game/paint-examples`. The `/paint/studio` route mounts the
editor from `@app-game/paint/editor`.

The maintained drawing application lives in [apps/paint](../../apps/paint/README.md).

## Original experiment notes

To implement such app we need:

- WebGL wrapper - to simplify work with WebGL
- OffscreenCanvas - to do all heavy lifting (rendering and brush logic) in a separate thread
- Brush Engine - to handle brush logic (drawing, smoothing, interpolation, etc)
