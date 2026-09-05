import { createRoot, onCleanup } from 'solid-js';
import { createStrokeSampler } from './brush';
import { defaultCamera } from './camera';
import { createDocument } from './document';
import { createPaintRenderer } from './gpu/renderer';
import type { PaintCommand, PaintEvent } from './protocol';
import { decodeDocument, encodeDocument, loadCheckpoint, saveCheckpoint, snapshotDocument } from './storage';

/** Worker owns the document and GPU device. Solid's root scopes resource teardown. */
createRoot((dispose) => {
  const document = createDocument();
  let renderer: Awaited<ReturnType<typeof createPaintRenderer>> | undefined;
  let canvas: OffscreenCanvas;
  let storageName = 'paint-studio';
  let camera = defaultCamera();
  let size = { width: 1, height: 1 },
    dpr = 1;
  let sampler: ReturnType<typeof createStrokeSampler> | undefined;
  let saved = true,
    lost = false,
    renderMs = 0;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  const post = (event: PaintEvent) => self.postMessage(event);
  const status = () =>
    post({
      type: 'state',
      document: document.state(),
      camera,
      saved,
      renderMs,
      gpuBytes: renderer?.stats().gpuBytes ?? 0,
      residentTiles: renderer?.stats().residentTiles ?? 0
    });
  const failure = (error: unknown, recoverable = false) =>
    post({ type: 'error', message: error instanceof Error ? error.message : String(error), recoverable });
  const enqueue = (action: () => Promise<void>) => {
    queue = queue.then(action).catch((error) => failure(error));
  };
  const draw = async () => {
    if (!renderer || lost) return;
    const start = performance.now();
    await renderer.render(document.layers, camera, size, dpr);
    renderMs = performance.now() - start;
    status();
    await renderer.submitted();
  };
  const scheduleDraw = () => {
    if (renderTimer !== undefined) return;
    renderTimer = setTimeout(() => {
      enqueue(async () => {
        try {
          await draw();
        } finally {
          renderTimer = undefined;
        }
      });
    }, 0);
  };
  const save = async () => {
    if (sampler) return;
    await saveCheckpoint(snapshotDocument(document.layers, document.active.id, camera), storageName);
    saved = true;
    status();
  };
  const changed = () => {
    saved = false;
    status();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => enqueue(save), 600);
    scheduleDraw();
  };
  const end = async () => {
    if (!sampler || !renderer) return;
    const changes = await renderer.finish();
    sampler = undefined;
    try {
      document.commit(changes);
    } catch (error) {
      renderer.reset();
      scheduleDraw();
      throw error;
    }
    changed();
  };
  const cancel = () => {
    sampler = undefined;
    renderer?.cancel();
    if (!saved) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => enqueue(save), 600);
    }
    scheduleDraw();
  };
  const startRenderer = async () => {
    renderer?.destroy();
    renderer = await createPaintRenderer(canvas, (message) => {
      if (lost) return;
      lost = true;
      sampler = undefined;
      failure(new Error(`${message} Your completed strokes are preserved. Restore the renderer to continue.`), true);
    });
    lost = false;
  };
  onCleanup(() => {
    clearTimeout(renderTimer);
    clearTimeout(saveTimer);
    renderer?.destroy();
  });
  self.onmessage = (event: MessageEvent<PaintCommand>) =>
    enqueue(async () => {
      const command = event.data;
      switch (command.type) {
        case 'init': {
          canvas = command.canvas;
          storageName = command.storageName ?? 'paint-studio';
          size = command.size;
          dpr = command.dpr;
          try {
            const previous = await loadCheckpoint(storageName);
            if (previous) {
              document.replace(previous.layers, previous.activeId);
              camera = previous.camera;
            }
          } catch (error) {
            failure(error);
          }
          await startRenderer();
          await draw();
          post({ type: 'ready' });
          break;
        }
        case 'view': {
          const moved = JSON.stringify(camera) !== JSON.stringify(command.camera);
          camera = command.camera;
          size = command.size;
          dpr = command.dpr;
          if (moved) changed();
          else scheduleDraw();
          break;
        }
        case 'begin': {
          if (!renderer || lost || !document.active.visible) return;
          await end();
          saved = false;
          renderer.begin(document.active, command.brush);
          sampler = createStrokeSampler(command.brush);
          await renderer.paint(sampler.add(command.samples));
          scheduleDraw();
          break;
        }
        case 'samples':
          if (sampler && renderer && !lost) {
            await renderer.paint(sampler.add(command.samples));
            scheduleDraw();
          }
          break;
        case 'end':
          await end();
          break;
        case 'cancel':
          cancel();
          break;
        case 'undo':
          cancel();
          document.undo();
          renderer?.reset();
          changed();
          break;
        case 'redo':
          cancel();
          document.redo();
          renderer?.reset();
          changed();
          break;
        case 'layer':
          await end();
          document.changeLayer(command.action);
          renderer?.reset();
          changed();
          break;
        case 'save':
          await end();
          clearTimeout(saveTimer);
          await save();
          break;
        case 'download':
          await end();
          post({
            type: 'download',
            blob: new Blob([encodeDocument(snapshotDocument(document.layers, document.active.id, camera))], {
              type: 'application/json'
            }),
            name: 'drawing.paint'
          });
          break;
        case 'png':
          await end();
          await draw();
          post({ type: 'download', blob: await canvas.convertToBlob({ type: 'image/png' }), name: 'drawing-view.png' });
          break;
        case 'import': {
          const next = decodeDocument(command.text);
          cancel();
          document.replace(next.layers, next.activeId);
          camera = next.camera;
          renderer?.reset();
          post({ type: 'restored', camera });
          changed();
          break;
        }
        case 'recover':
          cancel();
          await startRenderer();
          await draw();
          post({ type: 'ready' });
          break;
        case 'dispose':
          await end();
          await save();
          dispose();
          post({ type: 'disposed' });
          self.close();
          break;
      }
    });
});
