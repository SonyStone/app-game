import { createRoot, onCleanup } from 'solid-js';
import { createSmoothStroke } from './smoothStroke';
import { defaultCamera } from './camera';
import { createDocument } from './document';
import { createPaintRenderer } from './gpu/renderer';
import type { PaintCommand, PaintEvent } from './protocol';
import { createTileStore } from './tileStore';
import { readPaintFile, writePaintFile } from './paintFile';
import { decodeDocument, snapshotDocument } from './storage';

/** Worker owns the document and GPU device. Solid's root scopes resource teardown. */
createRoot((dispose) => {
  const document = createDocument({ paged: true });
  let renderer: Awaited<ReturnType<typeof createPaintRenderer>> | undefined;
  let canvas: OffscreenCanvas;
  let storageName = 'paint-studio';
  let tileStore: Awaited<ReturnType<typeof createTileStore>>;
  let importing = false;
  let saveVersion = 0;
  let savedVersion = 0;
  let camera = defaultCamera();
  let debug = false;
  let size = { width: 1, height: 1 },
    dpr = 1;
  let sampler: ReturnType<typeof createSmoothStroke> | undefined;
  let saved = true,
    lost = false,
    renderMs = 0;
  let redraw = false;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let collectTimer: ReturnType<typeof setTimeout> | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let queue = Promise.resolve();
  const post = (event: PaintEvent) => self.postMessage(event);
  const status = () =>
    post({
      type: 'state',
      ...(debug
        ? { debugTiles: renderer?.debugTiles(document.layers) ?? [], debugPages: renderer?.debugPages() ?? [] }
        : {}),
      virtual: renderer?.stats().virtual,
      document: document.state(),
      camera,
      saved,
      renderMs,
      gpuBytes: renderer?.stats().gpuBytes ?? 0,
      storage: tileStore?.stats(),
      residentTiles: renderer?.stats().residentTiles ?? 0
    });
  const failure = (error: unknown, recoverable = false) =>
    post({ type: 'error', message: error instanceof Error ? error.message : String(error), recoverable });
  const enqueue = (action: () => Promise<void>) => {
    queue = queue.then(action).catch((error) => failure(error));
  };
  const draw = async (exact = false) => {
    if (!renderer || lost) return;
    const start = performance.now();
    await renderer.render(document.layers, camera, size, dpr, exact);
    renderMs = performance.now() - start;
    status();
    await renderer.submitted();
  };
  const scheduleDraw = () => {
    redraw = true;
    if (renderTimer !== undefined) return;
    renderTimer = setTimeout(() => {
      enqueue(async () => {
        try {
          redraw = false;
          await draw();
        } finally {
          renderTimer = undefined;
          if (redraw) scheduleDraw();
        }
      });
    }, 0);
  };
  const save = async () => {
    if (sampler || importing) return;
    const version = saveVersion;
    document.persist(tileStore.capture);
    await tileStore.save(snapshotDocument(document.layers, document.active.id, camera));
    savedVersion = Math.max(savedVersion, version);
    saved = savedVersion === saveVersion && !sampler;
    clearTimeout(collectTimer);
    collectTimer = setTimeout(() => {
      if (!sampler && !importing) void tileStore.collect(document.snapshots()).catch(failure);
    }, 5000);
    status();
  };
  const changed = () => {
    saved = false;
    saveVersion++;
    document.persist(tileStore.capture);
    status();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      enqueue(async () => {
        void save().catch(failure);
      });
    }, 300);
    scheduleDraw();
  };
  const end = async () => {
    if (!sampler || !renderer) return;
    await renderer.paint(sampler.finish());
    const changes = await renderer.finish();
    try {
      document.commit(changes);
      document.persist(tileStore.capture);
      await renderer.prepareOverview(document.layers);
    } catch (error) {
      renderer.reset();
      changed();
      throw error;
    } finally {
      sampler = undefined;
    }
    changed();
  };
  const cancel = () => {
    sampler = undefined;
    renderer?.cancel();
    if (!saved) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        enqueue(async () => {
          void save().catch(failure);
        });
      }, 300);
    }
    scheduleDraw();
  };
  const startRenderer = async () => {
    renderer?.destroy();
    renderer = await createPaintRenderer(
      canvas,
      (message) => {
        if (lost) return;
        lost = true;
        sampler = undefined;
        failure(new Error(`${message} Your completed strokes are preserved. Restore the renderer to continue.`), true);
      },
      {
        readTile: tileStore.read,
        overviewStorage: tileStore.overviews,
        virtualTexture: true,
        onRefine: scheduleDraw,
        onError: failure
      }
    );
    lost = false;
    await renderer.prepareOverview(document.layers);
    await tileStore.save(snapshotDocument(document.layers, document.active.id, camera));
  };
  onCleanup(() => {
    clearTimeout(collectTimer);
    clearTimeout(renderTimer);
    clearTimeout(saveTimer);
    renderer?.destroy();
  });
  self.onmessage = (event: MessageEvent<PaintCommand>) => {
    if (event.data.type === 'view' && renderer) {
      camera = event.data.camera;
      size = event.data.size;
      dpr = event.data.dpr;
      saveVersion++;
      saved = false;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        enqueue(async () => {
          void save().catch(failure);
        });
      }, 300);
      scheduleDraw();
      return;
    }
    enqueue(async () => {
      const command = event.data;
      switch (command.type) {
        case 'init': {
          canvas = command.canvas;
          storageName = command.storageName ?? 'paint-studio';
          size = command.size;
          dpr = command.dpr;
          tileStore = await createTileStore(storageName);
          const previous = await tileStore.load();
          if (previous) {
            document.replace(previous.layers, previous.activeId);
            camera = previous.camera;
            document.persist(tileStore.capture);
          }
          await startRenderer();
          await draw();
          post({ type: 'ready' });
          break;
        }
        case 'debug':
          debug = command.enabled;
          status();
          break;
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
          saveVersion++;
          renderer.begin(document.active, command.brush);
          sampler = createSmoothStroke(command.brush, command.zoom ?? camera.zoom);
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
          await renderer?.prepareOverview(document.layers);
          changed();
          break;
        case 'redo':
          cancel();
          document.redo();
          renderer?.reset();
          await renderer?.prepareOverview(document.layers);
          changed();
          break;
        case 'layer':
          await end();
          document.changeLayer(command.action);
          renderer?.reset();
          await renderer?.prepareOverview(document.layers);
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
            blob: await writePaintFile(snapshotDocument(document.layers, document.active.id, camera), tileStore.read),
            name: 'drawing.paint'
          });
          break;
        case 'png':
          await end();
          await draw(true);
          post({ type: 'download', blob: await canvas.convertToBlob({ type: 'image/png' }), name: 'drawing-view.png' });
          break;
        case 'import': {
          importing = true;
          clearTimeout(collectTimer);
          try {
            const next =
              'file' in command
                ? await readPaintFile(command.file, async (pixels) => {
                    const ref = tileStore.capture(pixels);
                    if (tileStore.stats().dirtyBytes >= 8 * 1048576) await tileStore.flush();
                    return ref;
                  })
                : decodeDocument(command.text);
            await tileStore.flush();
            cancel();
            document.replace(next.layers, next.activeId);
            camera = next.camera;
            document.persist(tileStore.capture);
            renderer?.reset();
            await renderer?.prepareOverview(document.layers);
            post({ type: 'restored', camera });
            changed();
          } finally {
            importing = false;
            if (!saved) {
              clearTimeout(saveTimer);
              saveTimer = setTimeout(() => {
                enqueue(async () => {
                  void save().catch(failure);
                });
              }, 300);
            }
          }
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
          await tileStore.close();
          post({ type: 'disposed' });
          self.close();
          break;
      }
    });
  };
});
