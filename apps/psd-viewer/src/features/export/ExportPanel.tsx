import type { PsdImage, PsdLayerPixels } from '@app-game/psd/viewer';
import { createSignal, onCleanup, Show } from 'solid-js';
import type { DisplayImage } from '../gpu-viewport/displayTiles';
import { maskImage } from '../inspection/pixels';
import type { View } from '../viewport/view';
import { pngBytes } from './png';
import { viewportImage } from './viewportImage';

/** Read-only downloads. Every PNG names its source and display-RGB8 fidelity; original bytes bypass rendering. */
export function ExportPanel(props: {
  name: string;
  state: string;
  fidelity: string;
  viewportSource: string;
  busy: boolean;
  shown: DisplayImage | undefined;
  full: PsdImage | undefined;
  view: View;
  size: { width: number; height: number };
  comparison: { image: PsdImage; divider: number } | undefined;
  overlay: DisplayImage | undefined;
  layer: PsdLayerPixels | undefined;
  layerName: string;
  mask: PsdLayerPixels['masks'][number] | undefined;
  onOriginal: () => Promise<Blob>;
  report: () => unknown;
}) {
  const [working, setWorking] = createSignal(false);
  const [error, setError] = createSignal('');
  const urls = new Set<string>();
  onCleanup(() => urls.forEach((url) => URL.revokeObjectURL(url)));

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    urls.add(url);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      urls.delete(url);
    }, 1000);
  }

  async function run(action: () => Promise<void>) {
    setWorking(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(String(error));
    } finally {
      setWorking(false);
    }
  }

  async function png(image: PsdImage, source: string) {
    const stem = props.name.replace(/\.(psd|psb)$/i, '').replace(/[^a-z0-9._-]/gi, '-');
    download(
      new Blob([await pngBytes(image)], { type: 'image/png' }),
      `${stem}-${source.replace(/[^a-z0-9._-]/gi, '-').slice(0, 140)}-display-rgb8.png`
    );
  }

  return (
    <details style={{ padding: '7px 10px', 'flex-shrink': 0 }}>
      <summary>Export and original download</summary>
      <p>
        PNG is display RGB8. Current state: {props.state}. PSD bytes stay unchanged. {props.fidelity}
      </p>
      <p>Viewport source: {props.viewportSource}. Display RGB8.</p>
      <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px' }}>
        <button
          disabled={working() || props.busy || !props.shown}
          onClick={() =>
            void run(() =>
              png(
                viewportImage(props.shown!, props.view, props.size, props.comparison, props.overlay),
                `viewport-${props.viewportSource}`
              )
            )
          }
        >
          Export viewport PNG
        </button>
        <button
          disabled={working() || props.busy || !props.full}
          onClick={() => void run(() => png(props.full!, `current-render-${props.state}`))}
        >
          Export full render PNG
        </button>
        <button
          disabled={working() || props.busy || !props.layer?.width || !props.layer?.height}
          onClick={() => void run(() => png(props.layer!, `saved-layer-${props.layerName}`))}
        >
          Export selected layer PNG
        </button>
        <button
          disabled={working() || props.busy || !props.mask}
          onClick={() => void run(() => png(maskImage(props.mask!), `saved-mask-${props.layerName}`))}
        >
          Export selected mask PNG
        </button>
        <button
          disabled={working()}
          onClick={() =>
            download(
              new Blob([JSON.stringify(props.report(), null, 2)], { type: 'application/json' }),
              `${props.name}-diagnostics.json`
            )
          }
        >
          Download diagnostics
        </button>
        <button
          disabled={working()}
          onClick={() => {
            const name = props.name;
            void run(async () => download(await props.onOriginal(), name));
          }}
        >
          Download unchanged original
        </button>
      </div>
      <p>
        Viewport uses CSS pixels with transparency, comparison and mask view; excludes checkerboard and UI. Full render
        uses current settings and overrides. Layer/mask use saved channels before effects and state transforms. Large
        full renders are unavailable beyond admission.
      </p>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </details>
  );
}
