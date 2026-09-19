# Brush preview

Embeddable Solid 2 drawing widget using `paint-core` and `abr-paint`. It imports neither Paint Studio
nor ABR Viewer. The standalone example build additionally rejects bundled ABR parser/editor code.

```tsx
import { BrushPreview } from '@app-game/brush-preview';
import { decodeRuntimeBrush } from '@app-game/abr-paint/runtimeBrush';

const preset = decodeRuntimeBrush(new Uint8Array(await response.arrayBuffer()));
// Mount inside a Solid root; the host supplies its own loading/error state.
<BrushPreview preset={preset} width={1024} height={768} background="colors" />;
```

`preset`, `color` and `mixing` are reactive. Changing color does not upload textures again.
Resource IDs must identify immutable versions. Brush replacement finishes the current gesture and
waits for resource acknowledgements before allowing new contact. Canvas CSS size may change; logical
width/height and initial background are fixed at mount. Use a new component instance for a new document.

The widget retains raw/coalesced pointer input, pressure and tablet axes from Studio's input adapter.
It uses the same brush sampler, GPU operations and adaptive LOD policy. This first embed runs the runtime
on the main thread, owns its GPU device and uses volatile memory storage. It provides no document import,
ABR editing, persistence or application-wide shortcuts. Unmount disposes listeners, observer and runtime.
Use `background="colors"` for editable paint underneath Smudge, Blur and Mixer Brush presets.

Vite consumers need the Solid 2 and TypeGPU plugins. See `apps/brush-preview/vite.config.ts`.
Run `pnpm --filter @app-game/brush-preview-demo dev` to open the example on port 3035; select a `.abrbrush`
exported from Viewer or the author-side converter. No original ABR is included in this application.
