import { record } from '@app-game/abr-brush/form';
import type { Brush as AbrBrush } from '@app-game/abr-parser/reader';
import { createSignal, createTrackedEffect, untrack } from 'solid-js';
import { attempt } from './asyncResult';
import { defaultBrush, type Brush } from './brush';
import { createBrushLibrary } from './brushLibrary/createBrushLibrary';
import { defaultCamera, transformAt, type Camera, type Point } from './camera';
import type { AbrBrushCommand } from './composition/abrBrushCommands';
import { createBrushCommands } from './composition/createBrushCommands';
import { createSelection } from './createSelection';
import { createDocument, type LayerAction } from './document';
import { attachInput, editable } from './input';
import { createMainThreadEndpoint, type PaintEndpoint } from './mainThreadEndpoint';
import Worker from './paint.worker?worker';
import { createPaintNavigation } from './paintNavigation';
import type { PaintCommand, PaintEvent } from './protocol';
import { defaultPaintSymmetry, paintSymmetrySchema, type PaintSymmetry } from './symmetry';

/** Scopes the selected engine transport, input and UI state to one editor mount. */
export function createPaintSession(elements: { canvas: () => HTMLCanvasElement; stage: () => HTMLDivElement }) {
  const [brush, setBrush] = createSignal<Brush>(
    { ...defaultBrush(), backgroundColor: '#ffffff' },
    { ownedWrite: true }
  );
  const [tool, setTool] = createSignal<Brush['tool'] | 'abr-brush' | 'lasso'>('brush', { ownedWrite: true });
  const [symmetry, setSymmetry] = createSignal(defaultPaintSymmetry(), { ownedWrite: true });
  const [camera, setCamera] = createSignal(defaultCamera(), { ownedWrite: true });
  const [state, setState] = createSignal(createDocument().state(), { ownedWrite: true });
  const [debug, setDebug] = createSignal(false, { ownedWrite: true });
  const [liveTail, setLiveTail] = createSignal(true, { ownedWrite: true });
  const [showPenCursor, setShowPenCursor] = createSignal(false, { ownedWrite: true });
  const [mixerPicking, setMixerPicking] = createSignal(false, { ownedWrite: true });
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
  const [workerEnabled, setWorkerMode] = createSignal(
    new URL(location.href).searchParams.get('paintThread') !== 'main',
    { ownedWrite: true }
  );
  const [canvasVersion, setCanvasVersion] = createSignal(0, { ownedWrite: true });
  const [switchingRenderer, setSwitchingRenderer] = createSignal(false, { ownedWrite: true });
  let nextWorkerEnabled: boolean | undefined;
  let rendererTools: Extract<PaintEvent, { type: 'checkpointed' }>['tools'];
  let historySource: Extract<PaintEvent, { type: 'checkpointed' }>['historySource'];
  let worker: PaintEndpoint | undefined;
  let size = { width: 1, height: 1 };
  const [viewSize, setViewSize] = createSignal(size, { ownedWrite: true });
  let currentCamera = defaultCamera();
  let animateSelection = true;
  let drawingActive = false;
  let roundProfile = defaultBrush(),
    abrProfile = defaultBrush();
  const brushCommands = createBrushCommands(
    () =>
      untrack(ready) && !untrack(switchingRenderer) && !selection.isBusy() && !drawingActive && !brushLibrary.isBusy()
  );
  const brushLibrary = createBrushLibrary({
    select: (engine) => {
      if (untrack(tool) === 'brush') roundProfile = untrack(brush);
      if (untrack(tool) === 'abr-brush') abrProfile = untrack(brush);
      const current = untrack(brush);
      abrProfile = { ...abrProfile, engine, color: current.color, backgroundColor: current.backgroundColor };
      setTool('abr-brush');
      setBrush(abrProfile);
    },
    canChange: () =>
      untrack(ready) && !untrack(switchingRenderer) && !selection.isBusy() && !drawingActive && !brushCommands.isBusy()
  });
  const send = (command: PaintCommand) => {
    if (untrack(switchingRenderer) && command.type !== 'dispose') return;
    if (
      selection.isBusy() &&
      !['selection', 'selection-view', 'view', 'debug', 'live-tail', 'dispose'].includes(command.type)
    )
      return;
    if (['begin', 'undo', 'redo', 'layer', 'import', 'recover'].includes(command.type)) selection.clear();
    if (command.type === 'begin') drawingActive = true;
    if (command.type === 'end' || command.type === 'cancel') drawingActive = false;
    worker?.postMessage(command);
  };
  const selection = createSelection({ send, document: () => untrack(state), ready: () => untrack(ready) });
  const canUpdateSymmetry = () => ready() && !switchingRenderer() && !selection.isBusy();
  createTrackedEffect(() => send({ type: 'selection-view', points: selection.points(), animate: animateSelection }));
  const navigate = (next: Camera) => {
    currentCamera = next;
    setCamera(next);
    send({ type: 'view', camera: next, size, dpr: devicePixelRatio });
  };
  const chooseTool = (next: ReturnType<typeof tool>) => {
    if (selection.isBusy()) return;
    setMixerPicking(false);
    selection.clear();
    const previous = untrack(tool);
    const current = untrack(brush);
    const colors = { color: current.color, backgroundColor: current.backgroundColor };
    if (previous === 'abr-brush') abrProfile = untrack(brush);
    if (previous === 'brush') roundProfile = untrack(brush);
    setTool(next);
    if (next === 'abr-brush') setBrush({ ...abrProfile, ...colors, tool: 'brush' });
    else if (next === 'brush') setBrush({ ...roundProfile, ...colors, tool: 'brush' });
    else if (next === 'eraser') setBrush((value) => ({ ...value, tool: 'eraser', engine: undefined }));
  };
  const updateBrush = (patch: Partial<Brush>) => {
    if (patch.tool) chooseTool(patch.tool);
    setBrush((value) => ({ ...value, ...patch }));
  };
  const layer = (action: LayerAction) => send({ type: 'layer', action });
  const isMixerBrush = () =>
    tool() === 'abr-brush' &&
    brush().engine?.id === 'abr' &&
    record(record(record(brush().engine?.settings).values).tool).type === 'MixB';
  const mixerCommand = async (command: AbrBrushCommand) => {
    const result = await brushCommands.run(untrack(brush), command);
    if (!result.ok) setError({ message: result.error, recoverable: false });
  };
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

  /** Attaches resources to one keyed canvas. UI state outlives this mount when execution mode changes. */
  const attachCanvas = (canvas: HTMLCanvasElement) => {
    const useWorker = untrack(workerEnabled);
    let engineDisposed = false;
    let retiring = false;
    const stage = elements.stage();
    if (!navigator.gpu || (useWorker && !canvas.transferControlToOffscreen)) {
      setError({
        message: useWorker
          ? 'Worker mode needs WebGPU and OffscreenCanvas. Try a current browser with hardware acceleration enabled.'
          : 'This editor needs WebGPU. Try a browser with hardware acceleration enabled.',
        recoverable: false
      });
      return;
    }
    const endpoint: PaintEndpoint = useWorker ? new Worker() : createMainThreadEndpoint();
    worker = endpoint;
    brushLibrary.connect(endpoint);
    brushCommands.connect(endpoint);
    drawingActive = false;
    setError(undefined);
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
    endpoint.onmessage = (event: MessageEvent<PaintEvent>) => {
      if (worker !== endpoint) return;
      const value = event.data;
      brushLibrary.receive(value);
      brushCommands.receive(value);
      if (value.type === 'checkpointed' && nextWorkerEnabled !== undefined && !retiring) {
        rendererTools = value.tools;
        historySource = value.historySource;
        retiring = true;
        endpoint.postMessage({ type: 'dispose' });
        return;
      }
      if (value.type === 'disposed' && nextWorkerEnabled !== undefined) {
        engineDisposed = true;
        endpoint.terminate();
        worker = undefined;
        setReady(false);
        const enabled = nextWorkerEnabled;
        nextWorkerEnabled = undefined;
        setWorkerMode(enabled);
        setDebugTiles([]);
        setPaging({});
        selection.receive({ type: 'selection', points: [], hasClipboard: false });
        setCanvasVersion((version) => version + 1);
        return;
      }
      if (value.type === 'selection') selection.receive(value);
      if (value.type === 'ready') {
        const finishReady = () => {
          rendererTools = undefined;
          historySource = undefined;
          setReady(true);
          setSwitchingRenderer(false);
          endpoint.postMessage({ type: 'live-tail', enabled: untrack(liveTail) });
          endpoint.postMessage({ type: 'debug', enabled: untrack(debug) });
          syncSelection();
          const url = new URL(location.href);
          if (useWorker) url.searchParams.delete('paintThread');
          else url.searchParams.set('paintThread', 'main');
          history.replaceState(history.state, '', url.href);
          measure();
          navigate(currentCamera);
        };
        if (!brushLibrary.hasSelection()) finishReady();
        else {
          setReady(false);
          void attempt(() => brushLibrary.restore()).then((result) => {
            if (worker !== endpoint) return;
            if (result.ok) finishReady();
            else {
              setSwitchingRenderer(false);
              setError({ message: result.error.message, recoverable: true });
            }
          });
        }
        return;
      }
      if (value.type === 'restored') {
        setSymmetry(value.symmetry ?? defaultPaintSymmetry());
        currentCamera = value.camera;
        setCamera(value.camera);
      }
      if (value.type === 'state') {
        if (initialState && value.symmetry) setSymmetry(value.symmetry);
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
        drawingActive = false;
        nextWorkerEnabled = undefined;
        setSwitchingRenderer(false);
        setError(value);
        if (value.recoverable || retiring) setReady(false);
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
    endpoint.onerror = (event) => {
      if (worker !== endpoint) return;
      brushCommands.connect(undefined);
      selection.receive({ type: 'selection', points: [], hasClipboard: false });
      nextWorkerEnabled = undefined;
      setSwitchingRenderer(false);
      setReady(false);
      setError({ message: event.message || 'The drawing engine stopped.', recoverable: false });
    };
    if (useWorker) {
      const offscreen = canvas.transferControlToOffscreen();
      endpoint.postMessage(
        { type: 'init', canvas: offscreen, size, dpr: devicePixelRatio, tools: rendererTools, historySource },
        [offscreen]
      );
    } else {
      endpoint.postMessage({ type: 'init', canvas, size, dpr: devicePixelRatio, tools: rendererTools, historySource });
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
      ready: () =>
        untrack(ready) &&
        !untrack(switchingRenderer) &&
        !selection.isBusy() &&
        !brushLibrary.isBusy() &&
        (untrack(tool) !== 'abr-brush' || !!untrack(brush).engine),
      navigate,
      send: (command) => {
        if (worker === endpoint) send(command);
      },
      cursor: setCursor,
      showPenCursor: () => untrack(showPenCursor),
      rawUpdate: () => setRawReceived(true),
      canvasAction: {
        enabled: (event) => untrack(isMixerBrush) && (untrack(mixerPicking) || event.altKey),
        run: (point) => {
          setMixerPicking(false);
          void mixerCommand({ type: 'load-canvas', point });
        }
      },
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
      else if (!modifier && !event.altKey && !event.repeat && !event.isComposing && key === 'x') {
        const current = untrack(brush);
        updateBrush({ color: current.backgroundColor ?? '#ffffff', backgroundColor: current.color });
      } else if (!modifier && !event.altKey && !event.isComposing && key === 'd')
        updateBrush({ color: '#000000', backgroundColor: '#ffffff' });
      else if (event.key === 'Escape') {
        setMixerPicking(false);
        setPuck(undefined);
        selection.clear();
        send({ type: 'cancel' });
      } else if (event.key === '[' || event.key === ']')
        updateBrush({
          size: Math.max(
            1,
            Math.min(
              untrack(brush).engine?.id === 'abr' ? 5000 : 512,
              untrack(brush).size * (event.key === '[' ? 0.8 : 1.25)
            )
          )
        });
    };
    window.addEventListener('keydown', keys);
    return () => {
      reducedMotion.removeEventListener('change', syncSelection);
      document.removeEventListener('visibilitychange', syncSelection);
      detach();
      resize.disconnect();
      window.removeEventListener('keydown', keys);
      if (worker === endpoint) {
        worker = undefined;
        brushLibrary.connect(undefined);
        brushCommands.connect(undefined);
      }
      if (engineDisposed) return;
      const timeout = setTimeout(() => endpoint.terminate(), 30_000);
      endpoint.onmessage = ({ data }) => {
        if (data.type === 'disposed' || data.type === 'error') {
          clearTimeout(timeout);
          endpoint.terminate();
        }
      };
      endpoint.postMessage({ type: 'dispose' });
    };
  };

  return {
    brushLibrary,
    brushCommandBusy: brushCommands.busy,
    /** Available only for the currently selected native Mixer Brush preset. */
    isMixerBrush,
    mixerCommand,
    mixerPicking,
    /** Arms a single canvas contact, for tablets without an Alt/Option key. Escape cancels it. */
    pickMixerPaint() {
      if (untrack(isMixerBrush) && untrack(ready) && !brushCommands.isBusy()) setMixerPicking(true);
    },
    /** Applies a detached preset and its resources only after upload succeeds; the Viewer owns the editable preset. */
    async useAbrBrush(brush: AbrBrush) {
      setMixerPicking(false);
      const { viewerBrush } = await import('./brushLibrary/viewerBrush');
      const selected = viewerBrush(brush);
      const applied = await brushLibrary.usePreset(selected);
      if (!applied) throw new Error(untrack(brushLibrary.error) ?? 'Wait for Paint to finish the current operation.');
      updateBrush({
        size: selected.size,
        spacing: selected.spacing,
        ...(selected.color === undefined ? {} : { color: selected.color }),
        ...(selected.backgroundColor === undefined ? {} : { backgroundColor: selected.backgroundColor }),
        ...(selected.flow === undefined ? {} : { flow: selected.flow }),
        ...(selected.opacity === undefined ? {} : { opacity: selected.opacity })
      });
    },
    attachCanvas,
    canvasVersion,
    symmetry,
    canUpdateSymmetry,
    /** Returns false while document commands are suspended, without changing the displayed guide. */
    updateSymmetry(settings: PaintSymmetry) {
      if (!untrack(canUpdateSymmetry)) return false;
      const next = paintSymmetrySchema.parse(settings);
      setSymmetry(next);
      send({ type: 'symmetry', settings: next });
      return true;
    },
    workerEnabled,
    switchingRenderer,
    /** Checkpoints and retires the old engine before Solid replaces only the canvas. UI settings stay alive. */
    setWorkerEnabled(enabled: boolean) {
      if (
        enabled === untrack(workerEnabled) ||
        untrack(switchingRenderer) ||
        selection.isBusy() ||
        brushLibrary.isBusy() ||
        brushCommands.isBusy() ||
        !untrack(ready)
      )
        return;
      nextWorkerEnabled = enabled;
      setMixerPicking(false);
      setSwitchingRenderer(true);
      setCursor(undefined);
      navigation.close();
      worker?.postMessage({ type: 'checkpoint', includeTools: true });
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
