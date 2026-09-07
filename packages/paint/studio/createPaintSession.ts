import { createSignal, createTrackedEffect, onSettled, untrack } from 'solid-js';
import { defaultBrush, type Brush } from './brush';
import { defaultCamera, transformAt, type Camera, type Point } from './camera';
import { createSelection } from './createSelection';
import { createDocument, type LayerAction } from './document';
import { attachInput, editable } from './input';
import { createMainThreadEndpoint, type PaintEndpoint } from './mainThreadEndpoint';
import Worker from './paint.worker?worker';
import { createPaintNavigation } from './paintNavigation';
import type { PaintCommand, PaintEvent } from './protocol';

/** Scopes the selected engine transport, input and UI state to one editor mount. */
export function createPaintSession(elements: { canvas: () => HTMLCanvasElement; stage: () => HTMLDivElement }) {
  const [brush, setBrush] = createSignal(defaultBrush(), { ownedWrite: true });
  const [tool, setTool] = createSignal<Brush['tool'] | 'lasso'>('brush', { ownedWrite: true });
  const [camera, setCamera] = createSignal(defaultCamera(), { ownedWrite: true });
  const [state, setState] = createSignal(createDocument().state(), { ownedWrite: true });
  const [debug, setDebug] = createSignal(false, { ownedWrite: true });
  const [liveTail, setLiveTail] = createSignal(true, { ownedWrite: true });
  const [showPenCursor, setShowPenCursor] = createSignal(false, { ownedWrite: true });
  const [rawReceived, setRawReceived] = createSignal(false, { ownedWrite: true });
  const [debugTiles, setDebugTiles] = createSignal<string[]>([], { ownedWrite: true });
  const [paging, setPaging] = createSignal<
    Pick<Extract<PaintEvent, { type: 'state' }>, 'storage' | 'virtual' | 'debugPages' | 'rasterDraws' | 'readback'>
  >({}, { ownedWrite: true });
  const [ready, setReady] = createSignal(false, { ownedWrite: true });
  const [saved, setSaved] = createSignal(true, { ownedWrite: true });
  const [saveState, setSaveState] = createSignal<Extract<PaintEvent, { type: 'state' }>['saveState']>('saved', {
    ownedWrite: true
  });
  const [error, setError] = createSignal<{ message: string; recoverable: boolean } | undefined>(undefined, {
    ownedWrite: true
  });
  const [cursor, setCursor] = createSignal<Point | undefined>(undefined, { ownedWrite: true });
  const [metrics, setMetrics] = createSignal({ tiles: 0, gpu: 0, ms: 0 }, { ownedWrite: true });
  const workerEnabled = new URL(location.href).searchParams.get('paintThread') !== 'main';
  const [switchingRenderer, setSwitchingRenderer] = createSignal(false, { ownedWrite: true });
  let nextWorkerEnabled: boolean | undefined;
  let worker: PaintEndpoint | undefined;
  let size = { width: 1, height: 1 };
  const [viewSize, setViewSize] = createSignal(size, { ownedWrite: true });
  let currentCamera = defaultCamera();
  let animateSelection = true;
  const send = (command: PaintCommand) => {
    if (untrack(switchingRenderer) && command.type !== 'dispose') return;
    if (
      selection.isBusy() &&
      !['selection', 'selection-view', 'view', 'debug', 'live-tail', 'dispose'].includes(command.type)
    )
      return;
    if (['begin', 'undo', 'redo', 'layer', 'import', 'recover'].includes(command.type)) selection.clear();
    worker?.postMessage(command);
  };
  const selection = createSelection({ send, document: () => untrack(state), ready: () => untrack(ready) });
  createTrackedEffect(() => send({ type: 'selection-view', points: selection.points(), animate: animateSelection }));
  const navigate = (next: Camera) => {
    currentCamera = next;
    setCamera(next);
    send({ type: 'view', camera: next, size, dpr: devicePixelRatio });
  };
  const chooseTool = (next: ReturnType<typeof tool>) => {
    if (selection.isBusy()) return;
    selection.clear();
    setTool(next);
    if (next !== 'lasso') setBrush((value) => ({ ...value, tool: next }));
  };
  const updateBrush = (patch: Partial<Brush>) => {
    if (patch.tool) chooseTool(patch.tool);
    setBrush((value) => ({ ...value, ...patch }));
  };
  const layer = (action: LayerAction) => send({ type: 'layer', action });
  const navigation = createPaintNavigation({
    size: viewSize,
    camera: () => currentCamera,
    navigate,
    viewport: () => elements.canvas().getBoundingClientRect()
  });
  const puck = navigation.center;
  const setPuck = (point: Point | undefined) => (point ? navigation.open(point) : navigation.close());
  const openPuck = (point?: Point) => navigation.open(point);
  const zoom = (factor: number) =>
    navigate(transformAt(currentCamera, size, { x: size.width / 2, y: size.height / 2 }, currentCamera.zoom * factor));

  onSettled(() => {
    const canvas = elements.canvas();
    const stage = elements.stage();
    if (!navigator.gpu || (workerEnabled && !canvas.transferControlToOffscreen)) {
      setError({
        message: workerEnabled
          ? 'Worker mode needs WebGPU and OffscreenCanvas. Try a current browser with hardware acceleration enabled.'
          : 'This editor needs WebGPU. Try a browser with hardware acceleration enabled.',
        recoverable: false
      });
      return;
    }
    worker = workerEnabled ? new Worker() : createMainThreadEndpoint();
    const measure = () => {
      size = { width: stage.clientWidth, height: stage.clientHeight };
      setViewSize(size);
    };
    measure();
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const syncSelection = () => {
      animateSelection = !reducedMotion.matches && !document.hidden;
      send({ type: 'selection-view', points: untrack(selection.points), animate: animateSelection });
    };
    reducedMotion.addEventListener('change', syncSelection);
    document.addEventListener('visibilitychange', syncSelection);
    syncSelection();
    let initialState = true;
    worker.onmessage = (event: MessageEvent<PaintEvent>) => {
      const value = event.data;
      if (value.type === 'checkpointed' && nextWorkerEnabled !== undefined) {
        const url = new URL(location.href);
        if (nextWorkerEnabled) url.searchParams.delete('paintThread');
        else url.searchParams.set('paintThread', 'main');
        location.assign(url.href);
        return;
      }
      if (value.type === 'selection') selection.receive(value);
      if (value.type === 'ready') {
        setReady(true);
        measure();
        navigate(currentCamera);
        return;
      }
      if (value.type === 'restored') {
        currentCamera = value.camera;
        setCamera(value.camera);
      }
      if (value.type === 'state') {
        setPaging((previous) => ({
          storage: value.storage,
          virtual: value.virtual,
          rasterDraws: value.rasterDraws,
          readback: value.readback,
          debugPages: value.debugPages ?? previous.debugPages
        }));
        if (value.debugTiles) setDebugTiles(value.debugTiles);
        if (initialState || value.document.revision !== untrack(state).revision) setState(value.document);
        setSaved(value.saved);
        setSaveState(value.saveState);
        setMetrics({ tiles: value.residentTiles, gpu: value.gpuBytes, ms: value.renderMs });
        if (initialState) {
          currentCamera = value.camera;
          setCamera(value.camera);
          initialState = false;
        }
      }
      if (value.type === 'error') {
        nextWorkerEnabled = undefined;
        setSwitchingRenderer(false);
        setError(value);
        if (value.recoverable) setReady(false);
      }
      if (value.type === 'download') {
        const url = URL.createObjectURL(value.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = value.name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    };
    worker.onerror = (event) => {
      selection.receive({ type: 'selection', points: [], hasClipboard: false });
      nextWorkerEnabled = undefined;
      setSwitchingRenderer(false);
      setReady(false);
      setError({ message: event.message || 'The drawing engine stopped.', recoverable: false });
    };
    if (workerEnabled) {
      const offscreen = canvas.transferControlToOffscreen();
      worker.postMessage({ type: 'init', canvas: offscreen, size, dpr: devicePixelRatio }, [offscreen]);
    } else {
      worker.postMessage({ type: 'init', canvas, size, dpr: devicePixelRatio });
    }
    const resize = new ResizeObserver(() => {
      measure();
      if (untrack(ready)) navigate(currentCamera);
    });
    resize.observe(stage);
    const detach = attachInput(canvas, {
      camera: () => currentCamera,
      size: () => size,
      brush: () => untrack(brush),
      ready: () => untrack(ready) && !untrack(switchingRenderer) && !selection.isBusy(),
      navigate,
      send,
      cursor: setCursor,
      showPenCursor: () => untrack(showPenCursor),
      rawUpdate: () => setRawReceived(true),
      puck: navigation,
      selection: { ...selection, enabled: () => untrack(tool) === 'lasso' }
    });
    const keys = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('dialog[open]')) return;
      if (editable(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && ['c', 'x', 'v'].includes(key) && untrack(tool) === 'lasso') {
        event.preventDefault();
        selection.action(key === 'c' ? 'copy' : key === 'x' ? 'cut' : 'paste');
      } else if (modifier && key === 'd') {
        event.preventDefault();
        selection.clear();
      } else if ((key === 'delete' || key === 'backspace') && untrack(tool) === 'lasso') {
        event.preventDefault();
        selection.action('delete');
      } else if (modifier && !event.altKey && !event.isComposing && (key === 'z' || event.code === 'KeyZ')) {
        event.preventDefault();
        send({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        send({ type: 'download' });
      } else if (!modifier && key === 'b') chooseTool('brush');
      else if (!modifier && key === 'e') chooseTool('eraser');
      else if (!modifier && key === 'l') chooseTool('lasso');
      else if (event.key === 'Escape') {
        setPuck(undefined);
        selection.clear();
        send({ type: 'cancel' });
      } else if (event.key === '[' || event.key === ']')
        updateBrush({ size: Math.max(1, Math.min(512, untrack(brush).size * (event.key === '[' ? 0.8 : 1.25))) });
    };
    window.addEventListener('keydown', keys);
    return () => {
      reducedMotion.removeEventListener('change', syncSelection);
      document.removeEventListener('visibilitychange', syncSelection);
      detach();
      resize.disconnect();
      window.removeEventListener('keydown', keys);
      send({ type: 'dispose' });
      const old = worker;
      const timeout = setTimeout(() => old?.terminate(), 30_000);
      if (old)
        old.onmessage = (event: MessageEvent<PaintEvent>) => {
          if (event.data.type === 'disposed' || event.data.type === 'error') {
            clearTimeout(timeout);
            old.terminate();
          }
        };
    };
  });

  return {
    workerEnabled: () => workerEnabled,
    switchingRenderer,
    /** Saves completed input before reloading with a fresh canvas. Failure keeps this session open. */
    setWorkerEnabled(enabled: boolean) {
      if (enabled === workerEnabled || untrack(switchingRenderer) || selection.isBusy() || !untrack(ready)) return;
      nextWorkerEnabled = enabled;
      setSwitchingRenderer(true);
      worker?.postMessage({ type: 'checkpoint' });
    },
    tool,
    liveTail,
    setLiveTail(enabled: boolean) {
      setLiveTail(enabled);
      send({ type: 'live-tail', enabled });
    },
    showPenCursor,
    setShowPenCursor,
    rawReceived,
    chooseTool,
    selection,
    debug,
    debugTiles,
    paging,
    toggleDebug() {
      const enabled = !debug();
      setDebug(enabled);
      if (!enabled) setDebugTiles([]);
      send({ type: 'debug', enabled });
    },
    brush,
    camera,
    state,
    ready,
    saved,
    saveState,
    error,
    cursor,
    puck,
    navigation,
    metrics,
    send,
    navigate,
    updateBrush,
    layer,
    openPuck,
    zoom,
    setPuck,
    setError,
    size: viewSize
  };
}

/** UI modules receive actions and accessors, without depending on GPU resources. */
export type PaintSession = ReturnType<typeof createPaintSession>;
