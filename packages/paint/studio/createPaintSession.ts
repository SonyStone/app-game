import { createSignal, onCleanup, onSettled, untrack } from 'solid-js';
import { defaultBrush, type Brush } from './brush';
import { defaultCamera, transformAt, type Camera, type Point } from './camera';
import { createDocument, type LayerAction } from './document';
import { attachInput, editable } from './input';
import Worker from './paint.worker?worker';
import type { PaintCommand, PaintEvent } from './protocol';

/** Scopes the worker, input listeners, persistence status, and UI state to one editor mount. */
export function createPaintSession(elements: { canvas: () => HTMLCanvasElement; stage: () => HTMLDivElement }) {
  const [brush, setBrush] = createSignal(defaultBrush(), { ownedWrite: true });
  const [camera, setCamera] = createSignal(defaultCamera(), { ownedWrite: true });
  const [state, setState] = createSignal(createDocument().state(), { ownedWrite: true });
  const [ready, setReady] = createSignal(false, { ownedWrite: true });
  const [saved, setSaved] = createSignal(true, { ownedWrite: true });
  const [error, setError] = createSignal<{ message: string; recoverable: boolean } | undefined>(undefined, {
    ownedWrite: true
  });
  const [cursor, setCursor] = createSignal<Point | undefined>(undefined, { ownedWrite: true });
  const [puck, setPuck] = createSignal<Point | undefined>(undefined, { ownedWrite: true });
  const [metrics, setMetrics] = createSignal({ tiles: 0, gpu: 0, ms: 0 }, { ownedWrite: true });
  let worker: globalThis.Worker | undefined;
  let size = { width: 1, height: 1 };
  const [viewSize, setViewSize] = createSignal(size, { ownedWrite: true });
  let currentCamera = defaultCamera();
  let cleanup: (() => void) | undefined;
  const send = (command: PaintCommand) => worker?.postMessage(command);
  const navigate = (next: Camera) => {
    currentCamera = next;
    setCamera(next);
    send({ type: 'view', camera: next, size, dpr: devicePixelRatio });
  };
  const updateBrush = (patch: Partial<Brush>) => setBrush((value) => ({ ...value, ...patch }));
  const layer = (action: LayerAction) => send({ type: 'layer', action });
  const openPuck = (point = { x: size.width / 2, y: size.height / 2 }) =>
    setPuck({
      x: Math.max(85, Math.min(size.width - 85, point.x)),
      y: Math.max(90, Math.min(size.height - 100, point.y))
    });
  const zoom = (factor: number) =>
    navigate(transformAt(currentCamera, size, { x: size.width / 2, y: size.height / 2 }, currentCamera.zoom * factor));

  onSettled(() => {
    const canvas = elements.canvas();
    const stage = elements.stage();
    if (!canvas.transferControlToOffscreen || !navigator.gpu) {
      setError({
        message:
          'This editor needs WebGPU and OffscreenCanvas. Try a current browser with hardware acceleration enabled.',
        recoverable: false
      });
      return;
    }
    worker = new Worker();
    const measure = () => {
      size = { width: stage.clientWidth, height: stage.clientHeight };
      setViewSize(size);
    };
    measure();
    const offscreen = canvas.transferControlToOffscreen();
    const init: PaintCommand = { type: 'init', canvas: offscreen, size, dpr: devicePixelRatio };
    worker.postMessage(init, [offscreen]);
    let initialState = true;
    worker.onmessage = (event: MessageEvent<PaintEvent>) => {
      const value = event.data;
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
        if (initialState || value.document.revision !== untrack(state).revision) setState(value.document);
        setSaved(value.saved);
        setMetrics({ tiles: value.residentTiles, gpu: value.gpuBytes, ms: value.renderMs });
        if (initialState) {
          currentCamera = value.camera;
          setCamera(value.camera);
          initialState = false;
        }
      }
      if (value.type === 'error') {
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
      setReady(false);
      setError({ message: event.message || 'The drawing worker stopped.', recoverable: false });
    };
    const resize = new ResizeObserver(() => {
      measure();
      if (untrack(ready)) navigate(currentCamera);
    });
    resize.observe(stage);
    const detach = attachInput(canvas, {
      camera: () => currentCamera,
      size: () => size,
      brush: () => untrack(brush),
      ready: () => untrack(ready),
      navigate,
      send,
      cursor: setCursor,
      puck: openPuck
    });
    const keys = (event: KeyboardEvent) => {
      if (editable(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        send({ type: event.shiftKey ? 'redo' : 'undo' });
      } else if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault();
        send({ type: 'download' });
      } else if (event.key.toLowerCase() === 'b') updateBrush({ tool: 'brush' });
      else if (event.key.toLowerCase() === 'e') updateBrush({ tool: 'eraser' });
      else if (event.key.toLowerCase() === 'v') openPuck();
      else if (event.key === 'Escape') {
        setPuck(undefined);
        send({ type: 'cancel' });
      } else if (event.key === '[' || event.key === ']')
        updateBrush({ size: Math.max(1, Math.min(512, untrack(brush).size * (event.key === '[' ? 0.8 : 1.25))) });
    };
    window.addEventListener('keydown', keys);
    cleanup = () => {
      detach();
      resize.disconnect();
      window.removeEventListener('keydown', keys);
      send({ type: 'dispose' });
      const old = worker;
      setTimeout(() => old?.terminate(), 3000);
    };
  });
  onCleanup(() => cleanup?.());

  return {
    brush,
    camera,
    state,
    ready,
    saved,
    error,
    cursor,
    puck,
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
