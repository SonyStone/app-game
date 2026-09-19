import type { decodeRuntimeBrush } from '@app-game/abr-paint/runtimeBrush';
import { createBrushResources } from '@app-game/abr-paint/resources';
import { createTaskQueue } from '@app-game/paint-core/asyncResult';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { attachInput } from '@app-game/paint-core/input';
import { createMemoryStorage } from '@app-game/paint-core/composition/memoryStorage';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { roundBrush } from '@app-game/paint-core/composition/roundBrushEngine';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { createAbrProcessor } from '@app-game/paint-core/composition/abrStrokeProcessor';
import { BrushEngines, BrushResources, Document, PaintRuntime, Renderer, Storage, StrokeProcessor,
  createPaintApplication } from '@app-game/paint-core/composition/PaintApplication';
import type { PaintEvent } from '@app-game/paint-core/protocol';
import { makeResizeObserver } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onCleanup } from 'solid-js';

/** Embeddable ABR-runtime scratchpad. Owns one GPU runtime and volatile document, with no editor or ABR loader.
 * Preset changes are reactive; in-flight strokes finish before resource replacement. Drawing size is fixed
 * at mount while CSS size may change. Unmount releases the runtime and input listeners.
 */
export function BrushPreview(props: {
  preset: ReturnType<typeof decodeRuntimeBrush>;
  /** Logical document dimensions, fixed at mount. Defaults to 1024 × 768 pixels. */
  width?: number;
  height?: number;
  /** Host working color. Saved preset color takes precedence unless this is supplied. */
  color?: string;
  /** Matches Studio's Smooth color by default; Classic is available for comparisons. */
  mixing?: Brush['mixing'];
  /** Initial editable paint for testing Smudge/Mixer/Blur. Fixed at mount; defaults to blank. */
  background?: 'blank' | 'colors';
  onStatus?: (message: string) => void;
}) {
  const width = props.width ?? 1024, height = props.height ?? 768;
  if (![width, height].every(n => Number.isInteger(n) && n > 0 && n <= 8192))
    throw new Error('Preview dimensions must be integers between 1 and 8192.');
  let canvas!: HTMLCanvasElement;
  let runtime: ReturnType<typeof createPaintApplication> | undefined;
  let selected: Brush | undefined;
  let stopped = false, generation = 0;
  const [ready, setReady] = createSignal(false, { ownedWrite: true });
  const [status, setStatus] = createSignal('Starting canvas…', { ownedWrite: true });
  const selections = createTaskQueue();
  const loaded = new Set<string>();
  const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const size = () => ({ width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) });
  const camera = () => ({ ...defaultCamera(), x: width / 2, y: height / 2, zoom: Math.min(size().width / width, size().height / height) });
  const report = (message: string) => { if (!stopped) { setStatus(message); props.onStatus?.(message); } };
  const receive = (event: PaintEvent) => {
    if (stopped) return;
    if (event.type === 'ready') {
      if (props.background === 'colors') {
        for (const [x, y, color] of [[0.35, 0.4, '#ed384f'], [0.65, 0.4, '#0089d4'], [0.5, 0.65, '#fbcf39']] as const) {
          runtime!.send({ type: 'begin', brush: { ...defaultBrush(), color, size: Math.min(width, height) * 0.6,
            hardness: 1, opacity: 1, flow: 1 }, samples: [{ x: x * width, y: y * height, pressure: 1, time: 0 }] });
          runtime!.send({ type: 'end' });
        }
      }
      setReady(true);
    }
    if (event.type === 'error') {
      selected = undefined;
      report(event.message);
      for (const request of pending.values()) request.reject(new Error(event.message));
      pending.clear();
    }
    if (event.type === 'brush-resources') {
      const request = pending.get(event.requestId);
      pending.delete(event.requestId);
      if (event.result.ok) {
        for (const id of event.result.value.evicted) loaded.delete(id);
        request?.resolve();
      } else request?.reject(new Error(event.result.error));
    }
  };
  const updateView = () => runtime?.send({ type: 'view', camera: camera(), size: size(), dpr: devicePixelRatio });
  const resize = makeResizeObserver(updateView);
  createEffect(() => undefined, () => {
    const storage = createMemoryStorage();
    runtime = createPaintApplication(binding => (
      <Document document={createDocument}>
        <Storage storage={storage}>
          <Renderer renderer={(target, lost, options) => createPaintRenderer(target, lost, {
            ...options, bounds: { x: 0, y: 0, width, height }
          })}>
            <StrokeProcessor processors={{ abr: createAbrProcessor, none: createRawProcessor }} selectProcessor={brush => brush.engine ? 'abr' : 'none'}>
              <BrushEngines engines={{ abr: abrBrush.engine, round: roundBrush.engine }} selectEngine={() => 'round'}>
                <BrushResources resources={createBrushResources}><PaintRuntime {...binding} /></BrushResources>
              </BrushEngines>
            </StrokeProcessor>
          </Renderer>
        </Storage>
      </Document>
    ), receive, () => undefined);
    runtime.send({ type: 'init', canvas, size: size(), dpr: devicePixelRatio, storageName: 'preview' });
    updateView();
    resize.observe(canvas);
    const detach = attachInput(canvas, {
      camera, size, ready: () => !!selected && !stopped, brush: () => ({ ...selected!, color: props.color ?? selected!.color, mixing: props.mixing ?? 'linear' }),
      navigate: () => undefined, cursor: () => undefined, send: command => runtime?.send(command)
    });
    return detach;
  });
  createEffect(() => ({ ready: ready(), preset: props.preset }), ({ ready, preset }) => {
    if (!ready || !runtime) return;
    const version = ++generation;
    selected = undefined;
    runtime.send({ type: 'end' });
    report('Preparing brush…');
    void selections.run(async () => {
      try {
        for (const resource of preset.resources) {
          if (stopped || version !== generation) return;
          if (loaded.has(resource.id)) continue;
          await new Promise<void>((resolve, reject) => {
            const requestId = crypto.randomUUID();
            pending.set(requestId, { resolve, reject });
            runtime!.send({ type: 'brush-resources', requestId, action: 'put', resource });
          });
          loaded.add(resource.id);
        }
        if (stopped || version !== generation) return;
        selected = { ...defaultBrush(), engine: preset.engine, size: preset.size, spacing: preset.spacing,
          color: preset.color ?? '#202020', backgroundColor: preset.backgroundColor,
          flow: preset.flow ?? 1, opacity: preset.opacity ?? 1 };
        report('Ready');
      } catch (error) {
        if (version === generation) report(error instanceof Error ? error.message : String(error));
      }
    });
  });
  onCleanup(() => {
    stopped = true;
    generation++;
    for (const request of pending.values()) request.reject(new Error('Preview disposed.'));
    pending.clear();
    runtime?.terminate();
  });
  return <div style={{ width: '100%' }}>
    <canvas ref={canvas} aria-label="Brush preview canvas" tabindex="0"
      style={{ width: '100%', display: 'block', 'aspect-ratio': `${width} / ${height}`, 'touch-action': 'none', background: '#faf8f5' }} />
    <div style={{ display: 'flex', gap: '12px', padding: '8px 0', 'align-items': 'center' }}>
      <button type="button" disabled={!ready()} onClick={() => runtime?.send({ type: 'undo' })}>Undo</button>
      <button type="button" disabled={!ready()} onClick={() => runtime?.send({ type: 'redo' })}>Redo</button>
      <span role="status">{status()}</span>
    </div>
  </div>;
}
