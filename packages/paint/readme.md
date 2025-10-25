To implement such app we need:

- WebGL wrapper - to simplify work with WebGL
- OffscreenCanvas - to do all heavy lifting (rendering and brush logic) in a separate thread
- Brush Engine - to handle brush logic (drawing, smoothing, interpolation, etc)
