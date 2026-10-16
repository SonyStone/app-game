import type { decodeRuntimeBrush } from '@app-game/abr-paint/runtimeBrush';
import { createBrushResources, type BrushResource } from '@app-game/abr-paint/resources';
import { createTaskQueue } from '@app-game/paint-core/asyncResult';
import { defaultBrush, type Brush, type Sample } from '@app-game/paint-core/brush';
import { defaultCamera } from '@app-game/paint-core/camera';
import { createDocument } from '@app-game/paint-core/document';
import { createPaintRenderer } from '@app-game/paint-core/gpu/renderer';
import { attachInput } from '@app-game/paint-core/input';
import { createMemoryStorage } from '@app-game/paint-core/composition/memoryStorage';
import type { PaintModules } from '@app-game/paint-core/composition/contracts';
import { abrBrush } from '@app-game/paint-core/composition/abrBrushEngine';
import { roundBrush } from '@app-game/paint-core/composition/roundBrushEngine';
import { createRawProcessor } from '@app-game/paint-core/strokeProcessors';
import { createAbrProcessor } from '@app-game/paint-core/composition/abrStrokeProcessor';
import { BrushEngines, BrushResources, Document, PaintRuntime, Renderer, Storage, StrokeProcessor,
  createPaintApplication } from '@app-game/paint-core/composition/PaintApplication';
import type { PaintCommand, PaintEvent } from '@app-game/paint-core/protocol';
import { makeResizeObserver } from '@solid-primitives/resize-observer';
import { createEffect, createSignal, onCleanup, untrack } from 'solid-js';

/** Embeddable ABR-runtime scratchpad. Owns one GPU runtime and volatile document, with no editor or ABR loader.
 * Preset and brush changes are reactive; in-flight strokes finish before resource replacement. Drawing size is fixed
 * at mount while CSS size may change. Unmount releases the runtime and input listeners.
 */
export function BrushPreview(props: {
  /** ABR runtime preset to draw with; its resources upload before the first stroke. Takes precedence over `brush`. */
  preset?: ReturnType<typeof decodeRuntimeBrush>;
  /**
   * Brush to draw with when there is no `preset`, such as a round brush or an editor's current brush; `resources`
   * holds the images its engine needs. The `recipe` chooses its stroke processor and engine.
   */
  brush?: Brush;
  /** Images `brush` refers to, such as an ABR tip; uploaded before its first stroke. Ignored with a `preset`. */
  resources?: readonly BrushResource[];
  /**
   * Stroke processors and brush engines, fixed at mount. Defaults to raw input with the round brush, or the ABR
   * engine and its smoothing for brushes with ABR engine settings; an editor passes its own to draw as its canvas does.
   */
  recipe?: Pick<PaintModules, 'processors' | 'selectProcessor' | 'engines' | 'selectEngine'>;
  /**
   * Maps raw pen pressure before the brush sees it, such as a calibration curve; mouse and touch keep pressure 1.
   * With `redraw`, pass a new function when the mapping changes: the strokes are then drawn again with it.
   */
  mapPressure?: (raw: number) => number;
  /**
   * Keeps the strokes drawn on the canvas with their raw pen pressure and draws them all again, on a fresh layer,
   * whenever `mapPressure`, `brush`, `preset` or `color` changes, so the same strokes show each setting. Undo, Redo
   * and Clear then act on the kept strokes. Fixed at mount.
   */
  redraw?: boolean;
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
  const redrawing = untrack(() => !!props.redraw);
  const recipe = untrack(() => props.recipe) ?? defaultRecipe;
  let canvas!: HTMLCanvasElement;
  let runtime: ReturnType<typeof createPaintApplication> | undefined;
  let selected: Brush | undefined;
  let stopped = false, generation = 0;
  const [ready, setReady] = createSignal(false, { ownedWrite: true });
  const [status, setStatus] = createSignal('Starting canvas…', { ownedWrite: true });
  const [kept, setKept] = createSignal(0, { ownedWrite: true });
  const selections = createTaskQueue();
  const loaded = new Set<string>();
  const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const strokes = createStrokeLog();
  const size = () => ({ width: Math.max(1, canvas.clientWidth), height: Math.max(1, canvas.clientHeight) });
  const camera = () => ({ ...defaultCamera(), x: width / 2, y: height / 2, zoom: Math.min(size().width / width, size().height / height) });
  const report = (message: string) => { if (!stopped) { setStatus(message); props.onStatus?.(message); } };
  const current = () => ({ ...selected!, color: props.color ?? selected!.color, mixing: props.mixing ?? 'linear' });
  const mapped = (samples: Sample[]) => samples.map(sample =>
    sample.pointerType === 'pen' && props.mapPressure ? { ...sample, pressure: props.mapPressure(sample.pressure) } : sample);
  /** Sends input commands with mapped pressure, keeping their raw samples when strokes are redrawn. */
  const send = (command: PaintCommand) => {
    if (redrawing) strokes.record(command);
    if (command.type === 'begin' || command.type === 'samples')
      runtime?.send({ ...command, samples: mapped(command.samples ?? []) });
    else runtime?.send(command);
    if (command.type === 'end') { setKept(strokes.count()); strokes.flushPending() && redraw(); }
  };
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
      // Kept strokes go on a layer of their own, above the background, which redrawing replaces.
      if (redrawing) runtime!.send({ type: 'layer', action: { type: 'add' } });
      setReady(true);
    }
    if (event.type === 'state' && redrawing) {
      const next = strokes.adopt(event.document.activeId, event.document.layers.length);
      if (next === 'redraw') redraw();
      else if (next) swap(next.staged);
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
  /**
   * Draws the kept strokes again on a fresh layer; waits for a stroke in progress or the previous redraw. The layer is
   * added first; once the engine reports its id, `swap` fills it while it is transparent and then replaces the old
   * one, so the canvas never shows it half drawn or empty.
   */
  function redraw() {
    // Effects call this after their tracked reads; the current brush and mapping are read here once.
    untrack(() => {
      if (!runtime || !selected || !strokes.canRedraw()) return;
      strokes.stage();
      runtime.send({ type: 'layer', action: { type: 'add' } });
    });
  }
  /** Draws the kept strokes on the `staged` layer, hidden by zero opacity, then shows it in place of the old one. */
  function swap(staged: string) {
    if (!runtime) return;
    if (!selected) {
      // The brush is being replaced: drop the empty layer; choosing the brush redraws.
      strokes.abandon(staged);
      runtime.send({ type: 'layer', action: { type: 'delete', id: staged } });
      return;
    }
    const old = strokes.swap(staged);
    runtime.send({ type: 'layer', action: { type: 'update', id: staged, patch: { opacity: 0 } } });
    for (const stroke of strokes.kept()) {
      const [first, ...rest] = stroke.samples;
      if (!first) continue;
      runtime.send({ ...stroke.begin, brush: current(), samples: mapped([first]) });
      if (rest.length) runtime.send({ type: 'samples', samples: mapped(rest) });
      runtime.send({ type: 'end' });
    }
    runtime.send({ type: 'layer', action: { type: 'update', id: staged, patch: { opacity: 1 } } });
    runtime.send({ type: 'layer', action: { type: 'delete', id: old } });
  }
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
            <StrokeProcessor processors={recipe.processors} selectProcessor={recipe.selectProcessor}>
              <BrushEngines engines={recipe.engines} selectEngine={recipe.selectEngine}>
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
      camera, size, ready: () => !!selected && !stopped && (!redrawing || strokes.canDraw()), brush: current,
      navigate: () => undefined, cursor: () => undefined, send
    });
    return detach;
  });
  createEffect(() => ({ ready: ready(), preset: props.preset, brush: props.brush, resources: props.resources }),
    ({ ready, preset, brush, resources }) => {
      if (!ready || !runtime) return;
      const version = ++generation;
      selected = undefined;
      runtime.send({ type: 'end' });
      const next = preset ?? (brush && { brush, resources: resources ?? [] });
      if (!next) {
        report('No brush');
        return;
      }
      report('Preparing brush…');
      void selections.run(async () => {
        try {
          for (const resource of next.resources) {
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
          selected = 'brush' in next ? next.brush : { ...defaultBrush(), engine: next.engine, size: next.size,
            spacing: next.spacing, color: next.color ?? '#202020', backgroundColor: next.backgroundColor,
            flow: next.flow ?? 1, opacity: next.opacity ?? 1 };
          report('Ready');
          if (redrawing) redraw();
        } catch (error) {
          if (version === generation) report(error instanceof Error ? error.message : String(error));
        }
      });
    });
  // Strokes are drawn again for each new pressure mapping and color.
  createEffect(() => (redrawing ? [props.mapPressure, props.color, props.mixing] : undefined), (watched) => {
    if (watched) redraw();
  });
  onCleanup(() => {
    stopped = true;
    generation++;
    for (const request of pending.values()) request.reject(new Error('Preview disposed.'));
    pending.clear();
    runtime?.terminate();
  });
  const edit = (change: 'undo' | 'redo' | 'clear') => {
    if (!redrawing) return runtime?.send({ type: change === 'redo' ? 'redo' : 'undo' });
    if (strokes[change]()) { setKept(strokes.count()); redraw(); }
  };
  return <div style={{ width: '100%' }}>
    <canvas ref={canvas} aria-label="Brush preview canvas" tabindex="0"
      style={{ width: '100%', display: 'block', 'aspect-ratio': `${width} / ${height}`, 'touch-action': 'none', background: '#faf8f5' }} />
    <div style={{ display: 'flex', gap: '12px', padding: '8px 0', 'align-items': 'center' }}>
      <button type="button" disabled={!ready()} onClick={() => edit('undo')}>Undo</button>
      <button type="button" disabled={!ready()} onClick={() => edit('redo')}>Redo</button>
      {redrawing && <button type="button" disabled={!ready() || !kept()} onClick={() => edit('clear')}>Clear</button>}
      <span role="status">{status()}</span>
    </div>
  </div>;
}

/** Raw processing and the round brush, or the ABR engine and its smoothing for ABR brushes. */
const defaultRecipe: NonNullable<Parameters<typeof BrushPreview>[0]['recipe']> = {
  processors: { abr: createAbrProcessor, none: createRawProcessor },
  selectProcessor: brush => brush.engine ? 'abr' : 'none',
  engines: { abr: abrBrush.engine, round: roundBrush.engine },
  selectEngine: () => 'round'
};

/**
 * The strokes a redrawing preview keeps, with raw samples, and the layer they show on. A redraw stages a new layer
 * (`stage`); its id arrives with a later engine state (`adopt`), and `swap` makes it the strokes' layer. Until then
 * neither new strokes nor another redraw start; one asked for meanwhile, or during a stroke, runs once possible.
 */
function createStrokeLog() {
  type Kept = { begin: Extract<PaintCommand, { type: 'begin' }>; samples: Sample[] };
  let strokes: Kept[] = [], undone: Kept[] = [];
  let drawing: Kept | undefined;
  /** The layer the kept strokes show on; `undefined` until the engine first reports it. */
  let layer: string | undefined;
  /** A layer for the next redraw has been added and its id is awaited. */
  let staging = false;
  /** Replaced layers, which states sent before their replacement may still name as active. */
  const retired = new Set<string>();
  let wanted = false;
  /** The layer holds paint: kept strokes, or ones removed since the last redraw. */
  let painted = false;
  return {
    record(command: PaintCommand) {
      if (command.type === 'begin') drawing = { begin: { ...command, samples: [] }, samples: [...command.samples ?? []] };
      if (command.type === 'samples' && drawing) drawing.samples.push(...command.samples);
      if (command.type === 'end' && drawing) { strokes.push(drawing); undone = []; drawing = undefined; painted = true; }
    },
    count: () => strokes.length,
    kept: () => strokes,
    canDraw: () => !!layer && !staging,
    /**
     * Whether a redraw should start now: one is remembered while a stroke or the previous redraw is in progress, and
     * none is needed while the layer holds no strokes.
     */
    canRedraw() {
      wanted = true;
      if (!layer || staging || drawing) return false;
      wanted = false;
      const needed = painted || strokes.length > 0;
      painted = strokes.length > 0;
      return needed;
    },
    stage() { staging = true; },
    /**
     * Follows the engine's active layer among `layers` layers: the strokes' first layer, once there is more than the
     * background, or the staged layer, once it is added above the strokes' layer. Returns `redraw` when the first
     * layer arrives with a redraw waiting, and the staged layer's id when it arrives.
     */
    adopt(active: string, layers: number): 'redraw' | { staged: string } | undefined {
      if (retired.has(active)) return undefined;
      if (!layer) {
        if (layers < 2) return undefined;
        layer = active;
        return wanted ? 'redraw' : undefined;
      }
      if (staging && active !== layer && layers >= 3) {
        staging = false;
        return { staged: active };
      }
      return undefined;
    },
    /**
     * Makes `staged` the strokes' layer and returns the one it replaces. The swap draws with the latest settings, so
     * a redraw asked for while it was awaited is done by it.
     */
    swap(staged: string) {
      wanted = false;
      const old = layer!;
      retired.add(old);
      layer = staged;
      return old;
    },
    /** Gives up `staged`, keeping the strokes' layer, and remembers that a redraw is still wanted. */
    abandon(staged: string) {
      retired.add(staged);
      wanted = true;
    },
    flushPending: () => wanted,
    undo() { const last = strokes.pop(); if (last) undone.push(last); return !!last; },
    redo() { const next = undone.pop(); if (next) strokes.push(next); return !!next; },
    clear() { const had = strokes.length > 0; undone = [...strokes].reverse(); strokes = []; return had; }
  };
}
