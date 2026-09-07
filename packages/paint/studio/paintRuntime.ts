import { createRoot, onCleanup } from 'solid-js';
import { attempt, createTaskQueue, unwrapResult } from './asyncResult';
import { defaultCamera, type Point } from './camera';
import { createDocument } from './document';
import { createPaintRenderer } from './gpu/renderer';
import { readPaintFile, writePaintFile } from './paintFile';
import type { PaintEvent, PaintRuntimeCommand } from './protocol';
import { captureSelection, editSelection, translateSelection, type SelectionPixels } from './selection';
import { createSmoothStroke } from './smoothStroke';
import { decodeDocument, snapshotDocument } from './storage';
import { createTileStore } from './tileStore';

/** Owns document, persistence and GPU resources in either execution mode. Commands stay ordered.
 * The caller supplies event delivery and closes its transport after a graceful dispose.
 */
export function createPaintRuntime(post: (event: PaintEvent) => void, close: () => void) {
  return createRoot((dispose) => {
    const document = createDocument({ paged: true });
    let renderer: Awaited<ReturnType<typeof createPaintRenderer>> | undefined;
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    let storageName = 'paint-studio';
    let tileStore: Awaited<ReturnType<typeof createTileStore>>;
    let importing = false;
    let clipboard: SelectionPixels | undefined;
    let editingSelection = false;
    let selectionPoints: Point[] = [];
    let selectionAnimate = true;
    let selectionTimer: ReturnType<typeof setTimeout> | undefined;
    let saveVersion = 0;
    let savedVersion = 0;
    let pendingSaves = 0;
    let camera = defaultCamera();
    let debug = false;
    let liveTail = true;
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
    const queue = createTaskQueue();
    let active = true;
    let pendingSamples: Extract<PaintRuntimeCommand, { type: 'samples' }> | undefined;
    let documentState = document.state();
    let debugAt = 0;
    const status = () => {
      if (documentState.revision !== document.revision) documentState = document.state();
      const sendDebug = debug && performance.now() >= debugAt;
      if (sendDebug) debugAt = performance.now() + 100;
      const stats = renderer?.stats();
      post({
        type: 'state',
        ...(sendDebug
          ? { debugTiles: renderer?.debugTiles(document.layers) ?? [], debugPages: renderer?.debugPages() ?? [] }
          : {}),
        virtual: stats?.virtual,
        readback: stats?.readback,
        rasterDraws: { preview: stats?.previewTileDraws ?? 0, committed: stats?.sourceTileDraws ?? 0 },
        document: documentState,
        camera,
        saved,
        saveState: sampler ? 'unsaved' : pendingSaves > 0 ? 'saving' : saved ? 'saved' : 'unsaved',
        renderMs,
        gpuBytes: stats?.gpuBytes ?? 0,
        storage: tileStore?.stats(),
        residentTiles: stats?.residentTiles ?? 0
      });
    };
    const failure = (error: unknown, recoverable = false) =>
      post({ type: 'error', message: error instanceof Error ? error.message : String(error), recoverable });
    const reportResult = (result: Awaited<ReturnType<typeof attempt>>) => {
      if (!result.ok) failure(result.error);
    };
    const enqueue = (action: () => Promise<void>) => {
      void queue.run(() => (active ? action() : undefined)).then(reportResult);
    };
    const background = (action: () => Promise<unknown>) => {
      void attempt(action).then(reportResult);
    };
    const draw = async (exact = false) => {
      if (!renderer || lost) return;
      const start = performance.now();
      await renderer.render(document.layers, camera, size, dpr, exact);
      renderMs = performance.now() - start;
      status();
      await renderer.submitted();
      if (!exact) {
        clearTimeout(selectionTimer);
        if (selectionPoints.length >= 3 && selectionAnimate && !lost) selectionTimer = setTimeout(scheduleDraw, 33);
      }
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
      pendingSaves++;
      status();
      try {
        await tileStore.save(snapshotDocument(document.layers, document.active.id, camera));
        savedVersion = Math.max(savedVersion, version);
        saved = savedVersion === saveVersion && !sampler;
        clearTimeout(collectTimer);
        collectTimer = setTimeout(() => {
          if (!sampler && !importing && !editingSelection)
            background(() => tileStore.collect([...document.snapshots(), ...(clipboard?.tiles.values() ?? [])]));
        }, 5000);
      } finally {
        pendingSaves--;
        status();
      }
    };
    const changed = () => {
      saved = false;
      saveVersion++;
      document.persist(tileStore.capture);
      status();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        enqueue(async () => {
          background(save);
        });
      }, 300);
      scheduleDraw();
    };
    const end = async () => {
      if (!sampler || !renderer) return;
      try {
        // Readback can fail before commit. Discard that preview and release the sampler too,
        // otherwise every later begin/save retries the same rejected stroke.
        await renderer.paint(sampler.finish());
        const changes = await renderer.finish();
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
            background(save);
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
          failure(
            new Error(`${message} Your completed strokes are preserved. Restore the renderer to continue.`),
            true
          );
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
      renderer.setSelection(selectionPoints, selectionAnimate);
      await renderer.prepareOverview(document.layers);
      await tileStore.save(snapshotDocument(document.layers, document.active.id, camera));
    };
    onCleanup(() => {
      active = false;
      clearTimeout(selectionTimer);
      clearTimeout(collectTimer);
      clearTimeout(renderTimer);
      clearTimeout(saveTimer);
      renderer?.destroy();
    });
    const send = (command: PaintRuntimeCommand) => {
      if (!active) return;
      if (command.type === 'selection-view') {
        selectionPoints = command.points;
        selectionAnimate = command.animate;
        renderer?.setSelection(selectionPoints, selectionAnimate);
        clearTimeout(selectionTimer);
        scheduleDraw();
        return;
      }
      if (command.type === 'view' && renderer) {
        camera = command.camera;
        size = command.size;
        dpr = command.dpr;
        saveVersion++;
        saved = false;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          enqueue(async () => {
            background(save);
          });
        }, 300);
        scheduleDraw();
        return;
      }
      // Merge only consecutive, not-yet-started input packets. Keep every point and pressure,
      // but render their latest state once after GPU backpressure clears. Commands such as
      // end/cancel/begin seal the batch so points never cross a stroke boundary.
      if (command.type === 'samples' && pendingSamples) {
        for (const sample of command.samples) pendingSamples.samples.push(sample);
        return;
      }
      pendingSamples = command.type === 'samples' ? command : undefined;
      enqueue(async () => {
        if (pendingSamples === command) pendingSamples = undefined;
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
            debugAt = 0;
            status();
            break;
          case 'live-tail':
            liveTail = command.enabled;
            renderer?.preview(liveTail && sampler ? sampler.preview() : []);
            scheduleDraw();
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
            renderer.preview(liveTail ? sampler.preview() : []);
            // Present contact before a queued release can start readback/overview preparation.
            // Movement also presents directly, with pending packets batched behind GPU completion.
            await draw();
            break;
          }
          case 'samples':
            if (sampler && renderer && !lost) {
              await renderer.paint(sampler.add(command.samples));
              renderer.preview(liveTail ? sampler.preview() : []);
              await draw();
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
          case 'selection': {
            let points = command.points;
            editingSelection = true;
            clearTimeout(collectTimer);
            try {
              await end();
              if (lost || !renderer) throw new Error('Restore the renderer before editing a selection.');
              if (document.active.id !== command.layerId || document.revision !== command.revision)
                throw new Error('The layer changed. Select the pixels again.');
              if (!document.active.visible) throw new Error('Show the active layer before editing its pixels.');
              const storage = {
                read: tileStore.read,
                write: async (pixels: Uint8Array) => {
                  const ref = tileStore.capture(pixels);
                  if (tileStore.stats().dirtyBytes >= 8 * 1048576) await tileStore.flush();
                  return ref;
                }
              };
              const selected =
                command.action === 'paste' ? clipboard : await captureSelection(document.active, points, storage);
              if (!selected) throw new Error('Copy or cut a selection before pasting.');
              if (command.action === 'copy') {
                await tileStore.flush();
                clipboard = selected;
                break;
              }
              const { tiles: _tiles, ...properties } = document.active;
              const added =
                command.action === 'new-layer'
                  ? { ...properties, id: crypto.randomUUID(), name: `${properties.name} selection`, tiles: new Map() }
                  : undefined;
              const removing = command.action !== 'paste';
              const destination =
                command.action === 'cut' || command.action === 'delete' ? undefined : (added ?? document.active);
              const changes = await editSelection({
                selection: selected,
                source: removing ? document.active : undefined,
                destination,
                offset: command.action === 'move' ? command.offset : undefined,
                storage
              });
              await tileStore.flush();
              const addedInfo = added ? { ...properties, id: added.id, name: added.name } : undefined;
              document.commit(changes, addedInfo);
              if (command.action === 'cut') clipboard = selected;
              points =
                command.action === 'cut' || command.action === 'delete'
                  ? []
                  : command.action === 'move'
                    ? translateSelection(selected.points, command.offset ?? { x: 0, y: 0 })
                    : selected.points;
              renderer.reset();
              // Mark the committed edit dirty even if preparing derived GPU pages fails.
              changed();
              await renderer.prepareOverview(document.layers);
            } finally {
              editingSelection = false;
              clearTimeout(collectTimer);
              collectTimer = setTimeout(() => {
                if (!sampler && !importing && !editingSelection)
                  background(() => tileStore.collect([...document.snapshots(), ...(clipboard?.tiles.values() ?? [])]));
              }, 5000);
              post({ type: 'selection', points, hasClipboard: !!clipboard });
            }
            break;
          }
          case 'checkpoint':
            await end();
            clearTimeout(saveTimer);
            await save();
            post({ type: 'checkpointed' });
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
            post({ type: 'download', blob: await canvasPng(canvas), name: 'drawing-view.png' });
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
                    background(save);
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
            unwrapResult(await tileStore.close());
            post({ type: 'disposed' });
            close();
            break;
        }
      });
    };
    return {
      send,
      /** Releases local resources after in-flight commands finish, including failed initialization. */
      terminate() {
        enqueue(async () => {
          dispose();
          if (tileStore) unwrapResult(await tileStore.close());
        });
      }
    };
  });
}

/** Exports the presented canvas without introducing an offscreen surface in main-thread mode. */
async function canvasPng(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not export the canvas.'))), 'image/png');
  });
}
