import { render } from '@solidjs/web';
import { createSignal, Show } from 'solid-js';
import { decodeRuntimeBrush } from '@app-game/abr-paint/runtimeBrush';
import { BrushPreview } from '@app-game/brush-preview';
import './style.css';

/** Supplier/demo workflow: open a compiled brush. This app never receives its original ABR. */
function PreviewDemo() {
  const [preset, setPreset] = createSignal<ReturnType<typeof decodeRuntimeBrush> | undefined>(undefined, { ownedWrite: true });
  const [error, setError] = createSignal('', { ownedWrite: true });
  const [color, setColor] = createSignal('#202020');
  let generation = 0;
  return <main>
    <h1>Try a brush</h1>
    <p>Open a .abrbrush exported from ABR Viewer. Draw with a mouse or stylus.</p>
    <div class="controls">
      <label>Brush <input type="file" accept=".abrbrush" onChange={async event => {
        const file = event.currentTarget.files?.[0];
        const version = ++generation;
        if (!file) return;
        setError('');
        try {
          if (file.size > 50 * 1024 * 1024) throw new Error('The brush file exceeds 50 MiB.');
          const loaded = decodeRuntimeBrush(new Uint8Array(await file.arrayBuffer()));
          if (version === generation) setPreset(loaded);
        } catch (error) { if (version === generation) setError(error instanceof Error ? error.message : String(error)); }
      }} /></label>
      <label>Color <input type="color" value={color()} onInput={event => setColor(event.currentTarget.value)} /></label>
    </div>
    <p role="alert">{error()}</p>
    <Show when={preset()}><h2>{preset()!.name}</h2><BrushPreview preset={preset()!} color={color()} background="colors" /></Show>
  </main>;
}

const element = document.getElementById('app');
if (!element) throw new Error('Missing preview mount element.');
render(() => <PreviewDemo />, element);
