# SolidGPU Example Sketches

These examples are proposal sketches for the API described in
[`../DESIGN.md`](../DESIGN.md). They are not implementation files yet.

The examples are intentionally split by scale:

- [`01-triangle.md`](./01-triangle.md): smallest low-level render graph example
- [`02-mesh-cube.md`](./02-mesh-cube.md): simple 3D mesh and cube examples
- [`03-2d-scene.md`](./03-2d-scene.md): simple 2D sprites, shapes, and instancing
- [`04-typegpu-draw-app.md`](./04-typegpu-draw-app.md): app-scale sketch inspired
  by `packages/typegpu-examples/typegpu-draw-app-example`
- [`05-grease-pencil-app.md`](./05-grease-pencil-app.md): app-scale sketch
  inspired by `apps/grease-pencil-typegpu`
- [`06-photoshop-like-app.md`](./06-photoshop-like-app.md): layered image editor
  sketch with documents, tools, compositing, masks, selections, and history
- [`07-offscreen-worker.md`](./07-offscreen-worker.md): worker-first
  OffscreenCanvas setup inspired by `packages/paint/offscreen-canvas-paint`

The goal is to make the proposed usage concrete enough to critique before
implementation.

Some app-scale sketches introduce possible helper components such as
`RenderStep` or `DepthTexture`. Treat those as API pressure tests, not committed
MVP requirements.
