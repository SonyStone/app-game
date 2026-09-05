# WebGL state diagram

This package instruments a real WebGL or WebGL2 context and renders its current state with SolidJS.
It forwards calls to the native context, so the application keeps using the standard WebGL API.

The diagram includes:

- global, clear, depth, blend, stencil, raster, multisample, transform-feedback, and pixel-store state;
- texture units, current vertex attributes, and WebGL2 indexed buffer bindings;
- buffers, textures, samplers, shaders, programs, vertex arrays, framebuffers, renderbuffers, queries,
  syncs, and transform-feedback objects;
- directional arrows for bindings, attachments, VAO buffer references, shader links, sampler textures,
  and draw-time program relationships;
- solid lines for direct references and dotted lines for indirect draw-time references;
- an opening reading guide plus contextual help for state groups, fields, and object types; and
- draggable panels, a live call log, pause and capture controls, an unbound-object toggle, and
  generated non-overlapping layout.

Instrument one context directly:

```tsx
import { WebGLStateDiagram, instrumentWebGLContext } from '@app-game/webgl-state-diagram';

const canvas = document.querySelector('canvas')!;
const native = canvas.getContext('webgl2')!;
const { context: gl, inspector } = instrumentWebGLContext(native);

// Give `gl` to the renderer. It is API-compatible with `native`.
renderApplication(gl);

export default () => <WebGLStateDiagram inspector={inspector} canvas={canvas} />;
```

Set `initialHelpOpen={false}` if the host application should not open the reading guide on mount.

To catch contexts created inside code you do not control, install the hook first:

```ts
import { installWebGLContextHook } from '@app-game/webgl-state-diagram/instrumentation';

const hook = installWebGLContextHook({
  onContext(inspector) {
    mountInspector(inspector);
  }
});

startApplication();

// Restore `HTMLCanvasElement.prototype.getContext` when the host is torn down.
hook.restore();
```

The hook affects future `webgl`, `experimental-webgl`, and `webgl2` context requests. Global state
can still be read when an existing context is instrumented, but object setup calls made earlier are
not recoverable.

The included route reads the official Three.js `files.json` catalog and offers every category whose
name starts with `webgl`. Selecting an example fetches its original HTML, preserves its official
asset base URL, and starts it inside a freshly patched iframe. The default Unreal Bloom example
exercises multiple post-processing passes and render targets.

## Inspect a page beside the diagram

`WebGLIframeStateDiagram` provides the two-pane host: the application stays in an iframe on the
left, while its live state diagram appears on the right. For a same-origin URL, the host fetches
the document, patches that iframe's `HTMLCanvasElement.prototype.getContext`, and only then writes
and starts the page. This ordering captures object creation as well as current global state.

```tsx
import { WebGLIframeStateDiagram } from '@app-game/webgl-state-diagram/iframe-state-diagram';

export default () => (
  <WebGLIframeStateDiagram
    src="/examples/three-scene.html"
    iframeTitle="Three.js scene"
    diagramTitle="Three.js · WebGL state"
  />
);
```

Use `srcdoc` with `initialize` when the host owns application startup. The initializer runs after
the document has been written and while the iframe hook is active. Return a cleanup function to
stop animation and release renderer resources on reload or unmount.

```tsx
<WebGLIframeStateDiagram
  srcdoc={'<!doctype html><canvas width="800" height="600"></canvas>'}
  initialize={({ document, window }) => {
    const application = startApplication(document.querySelector('canvas')!, window);
    return () => application.dispose();
  }}
/>
```

Browser same-origin rules prevent a parent page from monkey-patching an arbitrary cross-origin
iframe. Such a page must either be served from the inspector's origin, include the instrumentation
inside its own bundle, or cooperate through an injected browser extension or a `postMessage`
bridge. The `src` loader preserves relative asset URLs with a generated `<base>` element; pages
whose routers require a particular `window.location.pathname` should use `srcdoc` plus
`initialize`, or start the instrumentation inside their own bundle. Pages that replace the iframe
realm through navigation must reinstall the hook before the new application starts.

`ThreeExamplesStateDiagram` is also exported from `@app-game/webgl-state-diagram/three-examples`.
It deliberately excludes WebGPU, CSS, SVG, and audio examples because those pages do not create a
WebGL context for this inspector to observe. The component executes HTML from the fixed official
`https://threejs.org/examples/` origin; do not generalize this pattern to untrusted remote HTML.
