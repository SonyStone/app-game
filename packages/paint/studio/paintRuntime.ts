import { makeTimer } from '@solid-primitives/timer';
import { createRoot, onCleanup } from 'solid-js';
import { attempt, createTaskQueue, unwrapResult } from './asyncResult';
import { defaultCamera, type Point } from './camera';
import type { CanvasTargetValue } from './composition/CanvasTarget';
import type { BrushSession, PaintModules, PaintRenderer, PaintStorage } from './composition/contracts';
import { createResourceSession } from './composition/resourceSession';
import { symmetryRenderer } from './composition/symmetryRenderer';
import { readPaintFile, writePaintFile } from './paintFile';
import type { PaintEvent, PaintRuntimeCommand } from './protocol';
import { captureSelection, editSelection, translateSelection, type SelectionPixels } from './selection';
import { decodeDocument, snapshotDocument } from './storage';
import { defaultPaintSymmetry, paintSymmetrySchema, supportsPaintSymmetry } from './symmetry';

/** Owns document, persistence and GPU resources in either execution mode. Commands stay ordered.
 * The caller supplies event delivery and closes its transport after a graceful dispose.
 */
export function createPaintRuntime(post: (event: PaintEvent) => void, close: () => void, modules: PaintModules) {
  return createRoot((dispose) => {
    const document = modules.document();
    const resources = modules.resources();
    let renderer: PaintRenderer | undefined;
    let canvas: OffscreenCanvas | HTMLCanvasElement;
    const targets = new Map<string, CanvasTargetValue>();
    let primaryAttached = true;
    let storageName = 'paint-studio';
    let tileStore: PaintStorage;
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
    let symmetry = defaultPaintSymmetry();
    let debug = false;
    let liveTail = true;
    let size = { width: 1, height: 1 },
      dpr = 1;
    let strokeSession: BrushSession | undefined;
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
    let clearIdle: (() => void) | undefined;
    let idleGeneration = 0;
    const stopIdle = () => {
      idleGeneration++;
      clearIdle?.();
      clearIdle = undefined;
    };
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
        symmetry,
        saved,
        saveState: strokeSession ? 'unsaved' : pendingSaves > 0 ? 'saving' : saved ? 'saved' : 'unsaved',
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
      // Primary comes last so export and runtime diagnostics describe the editing view.
      if (!exact)
        for (const target of targets.values())
          await renderer.render(document.layers, target.camera, target.size, target.dpr, false, target.canvas);
      if (primaryAttached) await renderer.render(document.layers, camera, size, dpr, exact, canvas);
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
      if (strokeSession || importing) return;
      const version = saveVersion;
      document.persist(tileStore.capture);
      pendingSaves++;
      status();
      try {
        await tileStore.save(snapshotDocument(document.layers, document.active.id, camera, symmetry));
        savedVersion = Math.max(savedVersion, version);
        saved = savedVersion === saveVersion && !strokeSession;
        clearTimeout(collectTimer);
        collectTimer = setTimeout(() => {
          if (!strokeSession && !importing && !editingSelection)
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
    const updatePreview = () => {
      try {
        strokeSession?.preview(liveTail);
      } catch (error) {
        strokeSession = undefined;
        renderer?.reset();
        changed();
        throw error;
      }
    };
    const addSamples = async (samples: Parameters<BrushSession['add']>[0]) => {
      stopIdle();
      try {
        // Backpressure can merge many pointer packets. Present progress between
        // bounded chunks instead of hiding the whole stroke until that backlog ends.
        let presentedAt = performance.now();
        for (let offset = 0; offset < samples.length; offset += 16) {
          await strokeSession?.add(samples.slice(offset, offset + 16));
          if (offset + 16 < samples.length && performance.now() - presentedAt >= 8) {
            strokeSession?.preview(liveTail);
            await draw();
            presentedAt = performance.now();
          }
        }
        strokeSession?.preview(liveTail);
        scheduleIdle();
      } catch (error) {
        // The resource session already cancelled the engine and released its pins.
        strokeSession = undefined;
        renderer?.reset();
        changed();
        throw error;
      }
    };
    /** At most one idle operation is queued. Input/end invalidates even a timer already waiting in the GPU queue. */
    const scheduleIdle = (previousTime = performance.now()) => {
      const session = strokeSession;
      if (!session?.idle || !active || lost) return;
      const generation = idleGeneration;
      clearIdle = makeTimer(
        () => {
          clearIdle = undefined;
          enqueue(async () => {
            if (generation !== idleGeneration || strokeSession !== session || lost) return;
            const now = performance.now();
            try {
              if (!(await session.idle!(now - previousTime))) return;
              if (generation !== idleGeneration || strokeSession !== session || lost) return;
              session.preview(liveTail);
              await draw();
              scheduleIdle(now);
            } catch (error) {
              stopIdle();
              strokeSession = undefined;
              renderer?.reset();
              changed();
              throw error;
            }
          });
        },
        16,
        setTimeout
      );
    };
    const end = async () => {
      stopIdle();
      if (!strokeSession || !renderer) return;
      try {
        // Readback can fail before commit. Discard that preview and release the strokeSession too,
        // otherwise every later begin/save retries the same rejected stroke.
        const changes = await strokeSession.finish();
        document.commit(changes);
        document.persist(tileStore.capture);
        await renderer.prepareOverview(document.layers);
      } catch (error) {
        const cancellation = await attempt(() => strokeSession?.cancel());
        if (!cancellation.ok) failure(cancellation.error);
        renderer.reset();
        changed();
        throw error;
      } finally {
        strokeSession = undefined;
      }
      changed();
    };
    const cancel = () => {
      stopIdle();
      try {
        strokeSession?.cancel();
      } finally {
        strokeSession = undefined;
      }
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
      renderer = await modules.renderer(
        canvas,
        (message) => {
          if (lost) return;
          lost = true;
          stopIdle();
          const abandoned = strokeSession;
          strokeSession = undefined;
          if (abandoned) background(async () => abandoned.cancel());
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
      await tileStore.save(snapshotDocument(document.layers, document.active.id, camera, symmetry));
    };
    onCleanup(() => {
      active = false;
      stopIdle();
      clearTimeout(selectionTimer);
      clearTimeout(collectTimer);
      clearTimeout(renderTimer);
      clearTimeout(saveTimer);
      try {
        strokeSession?.cancel();
      } finally {
        strokeSession = undefined;
        try {
          renderer?.destroy();
        } finally {
          resources.dispose();
        }
      }
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
            tileStore = await modules.storage(storageName);
            const previous = await tileStore.load();
            if (previous) {
              document.replace(previous.layers, previous.activeId);
              camera = previous.camera;
              symmetry = previous.symmetry ?? defaultPaintSymmetry();
              document.persist(tileStore.capture);
            }
            await startRenderer();
            if (command.historySource) document.restoreHistorySource(command.historySource);
            if (command.tools !== undefined) renderer!.restoreTools(command.tools);
            await draw();
            post({ type: 'ready' });
            break;
          }
          case 'brush-resources': {
            const result = await attempt(() => {
              const evicted = command.action === 'put' ? resources.put(command.resource) : [];
              if (command.action === 'delete') resources.delete(command.id);
              return { evicted, stats: resources.stats() };
            });
            post({
              type: 'brush-resources',
              requestId: command.requestId,
              result: result.ok ? result : { ok: false, error: result.error.message }
            });
            break;
          }
          case 'brush-command': {
            const result = await attempt(async () => {
              if (!renderer || lost) throw new Error('The drawing engine is not ready.');
              if (strokeSession) throw new Error('Lift the pen before changing the brush load.');
              const id = command.brush.engine?.id ?? modules.selectEngine(command.brush);
              const engine = Object.hasOwn(modules.engines, id) ? modules.engines[id] : undefined;
              if (!engine?.command) throw new Error(`Brush engine "${id}" does not support commands.`);
              const scope = resources.open();
              try {
                await engine.command({
                  resources: scope,
                  renderer,
                  brush: command.brush,
                  settings: command.brush.engine?.settings,
                  layer: document.active,
                  layers: document.layers,
                  command: command.command
                });
              } finally {
                scope.release();
              }
            });
            post({
              type: 'brush-command',
              requestId: command.requestId,
              result: result.ok ? result : { ok: false, error: result.error.message }
            });
            break;
          }
          case 'symmetry': {
            const next = paintSymmetrySchema.parse(command.settings);
            await end();
            symmetry = next;
            changed();
            break;
          }
          case 'history-source':
            await end();
            document.selectHistorySource(command.id);
            status();
            break;
          case 'debug':
            debug = command.enabled;
            debugAt = 0;
            status();
            break;
          case 'live-tail':
            liveTail = command.enabled;
            updatePreview();
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
            const engineId = command.brush.engine?.id ?? modules.selectEngine(command.brush);
            const processorId = modules.selectProcessor(command.brush);
            const engine = Object.hasOwn(modules.engines, engineId) ? modules.engines[engineId] : undefined;
            const processor = Object.hasOwn(modules.processors, processorId)
              ? modules.processors[processorId]
              : undefined;
            if (!engine) throw new Error(`Brush engine "${engineId}" is not registered.`);
            if (!processor) throw new Error(`Stroke processor "${processorId}" is not registered.`);
            const strokeRenderer = supportsPaintSymmetry(command.brush)
              ? symmetryRenderer(renderer, symmetry)
              : renderer;
            strokeSession = createResourceSession(resources, (resources) =>
              engine({
                resources,
                settings: command.brush.engine?.settings,
                brush: command.brush,
                layer: document.active,
                layers: document.layers,
                historySource: document.historySourceLayer(document.active.id),
                modifiers: command.modifiers,
                view: { zoom: command.zoom ?? camera.zoom, angle: camera.angle, mirrored: camera.mirrored },
                renderer: strokeRenderer,
                processor: processor(command.brush, command.zoom ?? camera.zoom)
              })
            );
            saved = false;
            saveVersion++;
            await addSamples(command.samples);
            // Present contact before a queued release can start readback/overview preparation.
            // Movement also presents directly, with pending packets batched behind GPU completion.
            await draw();
            break;
          }
          case 'samples':
            if (strokeSession && renderer && !lost) {
              await addSamples(command.samples);
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
                if (!strokeSession && !importing && !editingSelection)
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
            post({
              type: 'checkpointed',
              ...(command.includeTools
                ? { tools: await renderer!.snapshotTools(), historySource: document.historySourceSnapshot() }
                : {})
            });
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
              blob: await writePaintFile(
                snapshotDocument(document.layers, document.active.id, camera, symmetry),
                tileStore.read
              ),
              name: 'drawing.paint'
            });
            break;
          case 'png':
            if (!primaryAttached) throw new Error('Attach a primary canvas before exporting the view.');
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
              symmetry = next.symmetry;
              document.persist(tileStore.capture);
              renderer?.reset();
              await renderer?.prepareOverview(document.layers);
              post({ type: 'restored', camera, symmetry });
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
      /** Serializes reactive attachment with input/GPU work. Removing a target releases only its view resources. */
      setTarget(id: string, value: CanvasTargetValue | undefined) {
        const target = value ? { ...value, camera: { ...value.camera }, size: { ...value.size } } : undefined;
        enqueue(async () => {
          if (
            target &&
            ((id !== 'main' && primaryAttached && target.canvas === canvas) ||
              [...targets].some(([otherId, other]) => otherId !== id && other.canvas === target.canvas))
          )
            throw new Error('A canvas cannot be attached to two targets.');
          if (id === 'main') {
            if (canvas && canvas !== target?.canvas) renderer?.releaseTarget(canvas);
            primaryAttached = !!target;
            if (target) {
              const moved = JSON.stringify(camera) !== JSON.stringify(target.camera);
              canvas = target.canvas;
              camera = target.camera;
              size = target.size;
              dpr = target.dpr;
              if (moved && tileStore) changed();
            }
          } else {
            const previous = targets.get(id);
            if (previous && previous.canvas !== target?.canvas) renderer?.releaseTarget(previous.canvas);
            if (target) targets.set(id, target);
            else targets.delete(id);
          }
          scheduleDraw();
        });
      },
      /** Releases local resources after in-flight commands finish, including failed initialization. */
      terminate() {
        enqueue(async () => {
          try {
            dispose();
          } finally {
            if (tileStore) unwrapResult(await tileStore.close());
          }
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
