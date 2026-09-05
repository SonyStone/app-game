# WebGL Spector DevTools

This Chrome extension adds a **Spector** panel to Developer Tools. The panel discovers canvas
elements in the inspected page and its cross-origin frames, so it works on Sketchfab, Three.js
examples, and other WebGL applications without putting an overlay over the site.

## Build and load

```sh
pnpm --filter @app-game/webgl-spector-devtools build
```

Then open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select:

```text
apps/sketchfab-spector/dist-extension
```

Open Developer Tools on any page and select the **Spector** tab. The sidebar lists every DOM canvas,
including its drawing-buffer size, CSS size, visibility, frame, and observed WebGL version. Ordinary
2D canvases remain visible in the list but cannot be captured by Spector.

Both capture modes work on an already-running application without reloading. **Capture next frame**
waits until the selected context makes its next WebGL call, then records that render task. This lets
you arm capture first and move the camera later; **Cancel waiting** disarms it without changing the
page. Once rendering starts, a narrow page-to-DevTools status bridge reports the number of calls
recorded and shows a separate processing phase while Spector builds the result. **Capture 500 calls**
records a fixed-size command sequence instead.

Captured results include dedicated **Textures** and **Meshes** tabs. Textures first uses images stored
with draw-call state, then samples missing or compressed live textures through a temporary WebGL 2
shader into portable RGBA previews. It automatically loads up to 16 previews and allows retrying any
failed item. Meshes opens with a **Full scene** view. It removes repeated depth, shadow, material, and
screen-space passes, then replays the remaining vertex shaders into camera-relative view space. The
default **Captured appearance** mode uses each vertex's exact captured clip position and projects the
final canvas image back onto the recovered geometry. This reproduces the captured camera and visible
surface appearance even when a site's minified shaders make individual material maps ambiguous. Use
**Reset camera** to return to that exact view after rotating or zooming. Because the captured appearance
is a view-dependent projection, newly exposed surfaces may smear when rotated. **Material maps** is the
rotatable alternative: when a draw has a likely UV attribute and a confidently identified 2D color map,
it uses a sampled 256-pixel texture preview. The selector favors color-map names and sRGB formats; it
leaves ambiguous multi-texture materials untextured instead of displaying normal, roughness, or mask
data as color. Draws without both inputs use distinct solid colors. This mode is an unlit reconstruction,
not a replay of the site's full PBR material, lighting, blending, or environment-map pipeline.

The Full scene footer can also show an XZ floor grid at Y=0 and positive XYZ axes. X is red, Y is green,
Z is blue, and a white point marks the recovered coordinate origin. These guides start hidden and use
the same recovered scene coordinates as the mesh preview.

Individual draw entries remain available beside the full scene. They read bounded vertex and index
data on demand, offer an attribute selector for minified shaders, and render a draggable perspective
solid-and-wireframe view. For WebGL 2 draws, the mesh reader first replays the captured vertex shader
with rasterization disabled and captures its output through transform feedback. It uses an inverse
projection or MVP uniform when one can be identified, producing rotatable post-deformation geometry;
raw attributes remain available as a fallback and through the position selector. Preview topology is
prepared once, anomalously long triangle-strip connectors are removed, and rotation is rendered on
the GPU. Individual mesh previews are limited to 60,000 elements, a 100,000-vertex span, and 4 MiB of
raw position-buffer data. The full-scene view keeps at most 96 unique draws and distributes a
2,000,000-element preview budget between them. Instanced draws currently preview their first instance.

The extension requests access to the inspected sites so that its isolated status bridge can notify
the DevTools panel even while inspected-window evaluation is blocked. The bridge only forwards
validated capture phase and command-count messages; it does not read page content. The extension
does not request tabs, browsing-history, cookie, or storage permissions.

## Development and architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module ownership, request lifecycle rules,
and the remaining architecture review findings.

```sh
pnpm --filter @app-game/webgl-spector-devtools test
pnpm --filter @app-game/webgl-spector-devtools test:browser
```

The browser checks require Playwright Chromium. They use a temporary profile and a local WebGL
fixture, with real extension injection and messaging. The command builds the extension first.

After updating the unpacked extension, reload it in `chrome://extensions` and reload the inspected
page once if it still contains an older capture agent without disposal support.
