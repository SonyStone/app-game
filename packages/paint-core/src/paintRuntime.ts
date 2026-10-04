import { makeTimer } from '@solid-primitives/timer';
import { createRoot, onCleanup } from 'solid-js';
import { attempt, createTaskQueue, unwrapResult, type Result } from './asyncResult';
import { defaultCamera, screenToWorld, type Point } from './camera';
import { averageOpaque, defaultColorSample, sampleLayer } from './colorSample';
import { layersInRect, layersInView, type DocumentRect } from './layersInView';
import type { CanvasTargetValue } from './composition/CanvasTarget';
import type { BrushSession, PaintModules, PaintRenderer, PaintStorage } from './composition/contracts';
import type { Layer, TileChange } from './document';
import type { FloatingPixels } from './gpu/floatingPixels';
import { createResourceSession } from './composition/resourceSession';
import { restoreFeatureData } from './composition/documentFeature';
import { readPaintFile, writePaintFile } from './paintFile';
import { isPsdFile, readPsdFile, writePsdFile } from './psdFile';
import type { PaintEvent, PaintRuntimeCommand } from './protocol';
import { mergeTilePixels } from './layerMerge';
import { captureSelection, editSelection, translateSelection, type SelectionPixels } from './selection';
import { decodeDocument, snapshotDocument } from './storage';
import { unpackTile, type TileData } from './tilePixels';
import { errorMessage, type GpuError } from '@app-game/solid-gpu/errors';

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
    /** Data of the document's features by feature ID, including features this runtime does not have. */
    let featureData = restoreFeatureData(modules.features);
    /** Data of the runtime's own features, as reported to the UI. */
    const reportedFeatures = () =>
      Object.fromEntries(modules.features.map((feature) => [feature.id, featureData[feature.id]]));
    let debug = false;
    let liveTail = true;
    let adaptiveQuality = true;
    let size = { width: 1, height: 1 },
      dpr = 1;
    let strokeSession: BrushSession | undefined;
    let saved = true,
      lost = false,
      renderMs = 0;
    let redraw = false;
    let renderTimer: ReturnType<typeof setTimeout> | undefined;
    let collectTimer: ReturnType<typeof setTimeout> | undefined;
    /** Read by storage when collection runs, after any saves queued ahead of it. */
    const liveTiles = () => [...document.snapshots(), ...(clipboard?.tiles.values() ?? [])];
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    let viewTimer: ReturnType<typeof setTimeout> | undefined;
    const queue = createTaskQueue();
    let active = true;
    let previousFrame: Promise<Result<void>> | undefined;
    let diagnostics = false;
    let processedInputTime: number | undefined;
    let receivedInputTime: number | undefined;
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
    /** The latest `layersInView` result and the document revision, camera and size it describes. */
    let inView = { signature: '', ids: [] as string[] };
    /** Regions named by `watch-regions` and their layers, for the document revision `revision`. */
    let watched: { regions: Record<string, DocumentRect>; revision: number; layers: Record<string, string[]> } = {
      regions: {},
      revision: -1,
      layers: {}
    };
    const status = () => {
      if (documentState.revision !== document.revision) documentState = document.state();
      const viewSignature = `${document.revision}|${camera.x},${camera.y},${camera.zoom},${camera.angle}|${size.width},${size.height}`;
      if (inView.signature !== viewSignature)
        inView = { signature: viewSignature, ids: layersInView(document.layers, camera, size) };
      if (watched.revision !== document.revision)
        watched = {
          ...watched,
          revision: document.revision,
          layers: Object.fromEntries(
            Object.entries(watched.regions).map(([name, rect]) => [name, layersInRect(document.layers, rect)])
          )
        };
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
        layersInView: inView.ids,
        layersInRegions: watched.layers,
        features: reportedFeatures(),
        saved,
        saveState: strokeSession ? 'unsaved' : pendingSaves > 0 ? 'saving' : saved ? 'saved' : 'unsaved',
        renderMs,
        gpuBytes: stats?.gpuBytes ?? 0,
        storage: tileStore?.stats(),
        residentTiles: stats?.residentTiles ?? 0
      });
    };
    const failure = (error: unknown, recoverable = false, code?: GpuError['code'], background = false) =>
      post({
        type: 'error',
        message: errorMessage(error),
        recoverable,
        ...(code ? { code } : {}),
        ...(background ? { background } : {})
      });
    const reportResult = (result: Awaited<ReturnType<typeof attempt>>) => {
      if (!result.ok) failure(result.error);
    };
    const enqueue = (action: () => Promise<void>) => {
      void queue.run(() => (active ? action() : undefined)).then(reportResult);
    };
    /** Bakes a layer into the layer below with its blend mode and opacity, clipped to the lower layer when that is
     * its clipping base. Returns the lower layer's changed tiles for `renderer.restore`, which reloads them by key. */
    const mergeDown = async (upperId: string) => {
      const index = document.layers.findIndex((layer) => layer.id === upperId);
      const upper = document.layers[index],
        lower = document.layers[index - 1];
      if (!upper || !lower) throw new Error('There is no layer below to merge into.');
      if (!upper.visible || !lower.visible) throw new Error('Show both layers before merging them.');
      const read = async (pixels: TileData | undefined) =>
        pixels && unpackTile(pixels instanceof Uint8Array ? pixels : await tileStore.read(pixels));
      // Layers clipped to the same base merge unclipped; the merged layer stays clipped to that base.
      const clipsToLower = !!upper.clipping && !lower.clipping;
      const merged = new Map<string, Uint8Array | undefined>();
      for (const [key, pixels] of upper.tiles) {
        const base = await read(lower.tiles.get(key));
        merged.set(
          key,
          mergeTilePixels(base, (await read(pixels))!, upper.blend, upper.opacity, clipsToLower ? { base } : undefined)
        );
      }

      document.mergeDown(upperId, merged);
      return [...merged.keys()].map((key) => ({ layerId: lower.id, key, before: undefined, after: undefined }));
    };
    /** Data that each document edit keeps between its commands; see `DocumentEditContext.state`. */
    const editStates = new Map<string, unknown>();
    /** The edit whose command committed the latest undo step, which its next command may amend. */
    let lastEdit: { edit: string; historyId: number } | undefined;
    /** Pixels an edit in progress shows moved; a replacement renderer shows them again. */
    let floating: FloatingPixels | undefined;
    /** Runs a module edit, committing or amending its undo step; returns the edit's reply. */
    const runEdit = async (command: Extract<PaintRuntimeCommand, { type: 'edit' }>) => {
      const edit = modules.edits.find((candidate) => candidate.id === command.edit);
      if (!edit) throw new Error(`Document edit "${command.edit}" is not installed.`);
      await end();
      if (lost || !renderer) throw new Error('Restore the renderer before editing the drawing.');
      /** The edit asked to stop showing its floating pixels once its changes are committed. */
      let clearFloating = false;
      const hideFloating = (hold: boolean) => {
        if (!clearFloating || !floating) return;
        floating = undefined;
        renderer?.setFloating(undefined);
        if (hold) renderer?.holdPresented();
        scheduleDraw();
      };
      let result: Awaited<ReturnType<typeof edit.run>>;
      try {
        result = await edit.run(
          {
            layers: document.layers,
            active: document.active,
            readTile: async (pixels) =>
              unpackTile(pixels instanceof Uint8Array ? pixels : await tileStore.read(pixels)),
            state: { get: () => editStates.get(edit.id), set: (value) => editStates.set(edit.id, value) },
            floating: {
              show(pixels) {
                floating = { ...pixels };
                renderer?.setFloating(floating);
                scheduleDraw();
              },
              move(matrix, interpolation) {
                if (!floating) return;
                floating = { ...floating, matrix, interpolation };
                renderer?.moveFloating(matrix, interpolation);
                scheduleDraw();
              },
              async clear() {
                // The frame kept on screen until the result has loaded shows the latest move.
                if (floating && redraw) await draw();
                clearFloating = true;
              }
            }
          },
          command.command
        );
      } catch (error) {
        // A failed result leaves the document unchanged; floating pixels must not stay on screen for it.
        hideFloating(false);
        throw error;
      }

      let reverted: readonly TileChange[] = [];
      if (result.amend) {
        if (lastEdit?.edit !== edit.id) throw new Error('The drawing changed while this edit was in progress.');
        reverted = document.revertLatest(lastEdit.historyId);
        lastEdit = undefined;
      }

      try {
        if (result.changes.length || result.layer) {
          document.commit(result.changes, result.layer);
          lastEdit = { edit: edit.id, historyId: document.latestHistoryId! };
        }
      } finally {
        const restored = [...reverted, ...result.changes];
        if (restored.length || result.layer) {
          renderer.restore(restored, document.layers);
          changed();
          await renderer.prepareOverview(document.layers);
        }

        // After `restore`, which drops held frames: the presented frame stays until the result has loaded.
        hideFloating(restored.length > 0);
      }

      return result.reply;
    };
    const background = (action: () => Promise<unknown>) => {
      void attempt(action).then((result) => {
        if (!result.ok) failure(result.error, false, undefined, true);
      });
    };
    let presentedAt = performance.now();
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
      const waitStart = performance.now();
      const timing = { processedInputTime, receivedInputTime, renderMs };
      const frameRenderer = renderer;
      const completion = attempt(async () => {
        await frameRenderer.submitted();
        if (diagnostics && active && renderer === frameRenderer)
          post({ type: 'frame', ...timing, queueWaitMs: performance.now() - waitStart });
      });
      // While drawing, prepare the next frame while this one runs on GPU. Waiting
      // for the preceding fence caps this at two frames; idle/exact draws drain both.
      const ready = strokeSession && !exact ? previousFrame : completion;
      previousFrame = completion;
      if (ready) {
        const result = await ready;
        if (!result.ok) throw result.error;
      }
      presentedAt = performance.now();
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
        await tileStore.save(snapshotDocument(document.layers, document.active.id, camera, featureData));
        savedVersion = Math.max(savedVersion, version);
        saved = savedVersion === saveVersion && !strokeSession;
        scheduleCollect();
      } finally {
        pendingSaves--;
        status();
      }
    };
    /** Collects unreachable tile versions after edits settle; strokes, imports and selection edits postpone it. */
    const scheduleCollect = () => {
      clearTimeout(collectTimer);
      collectTimer = setTimeout(() => {
        if (!strokeSession && !importing && !editingSelection) background(() => tileStore.collect(liveTiles));
      }, collectDelay);
    };
    const changed = () => {
      saved = false;
      saveVersion++;
      document.persist(tileStore.capture);
      status();
      scheduleSave();
      scheduleDraw();
    };
    /** Autosaves once input has paused for `saveDelay`; a later change restarts the delay. */
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        enqueue(async () => {
          background(save);
        });
      }, saveDelay);
    };
    /** Persists navigation in the small view record, without a full checkpoint or marking the drawing unsaved. */
    const viewChanged = () => {
      clearTimeout(viewTimer);
      viewTimer = setTimeout(() => {
        enqueue(async () => {
          if (tileStore) {
            background(() => tileStore.saveView(camera));
          }
        });
      }, 300);
    };
    /** Drops a stroke whose engine failed; the session already cancelled itself and released its pins. */
    const abandonStroke = () => {
      strokeSession = undefined;
      renderer?.reset();
      changed();
    };
    const updatePreview = () => {
      try {
        strokeSession?.preview(liveTail);
      } catch (error) {
        abandonStroke();
        throw error;
      }
    };
    const addSamples = async (samples: Parameters<BrushSession['add']>[0]) => {
      stopIdle();
      try {
        // Backpressure can merge many pointer packets. Present progress between
        // bounded chunks instead of hiding the whole stroke until that backlog ends.
        presentedAt = performance.now();
        for (let offset = 0; offset < samples.length; offset += 16) {
          await strokeSession?.add(samples.slice(offset, offset + 16));
          processedInputTime = samples[Math.min(samples.length, offset + 16) - 1]?.time;
          if (offset + 16 < samples.length && performance.now() - presentedAt >= progressFrameInterval) {
            strokeSession?.preview(liveTail);
            await draw();
            presentedAt = performance.now();
          }
        }
        strokeSession?.preview(liveTail);
        scheduleIdle();
      } catch (error) {
        abandonStroke();
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
              abandonStroke();
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
      if (!saved) scheduleSave();
      scheduleDraw();
    };
    /** Captures pixels of a large edit, flushing about every 8 MiB so RAM does not grow with the edit's area. */
    const stage = async (pixels: Uint8Array) => {
      const ref = tileStore.capture(pixels);
      if (tileStore.stats().dirtyBytes >= stagedFlushBytes) await tileStore.flush();
      return ref;
    };
    const startRenderer = async () => {
      renderer?.destroy();
      // A failed restart must not leave the destroyed renderer reachable by draw, recover or cleanup.
      renderer = undefined;
      renderer = await modules.renderer(
        canvas,
        (message, error) => {
          if (lost) return;
          lost = true;
          stopIdle();
          // A paint command may be suspended inside the session. Cancelling here would release its
          // renderer stroke mid-await, so the abandoned session is cancelled after that command ends.
          enqueue(async () => {
            const abandoned = strokeSession;
            strokeSession = undefined;
            abandoned?.cancel();
          });
          const code = error?.code ?? 'lost';
          failure(
            new Error(`${rendererFailureMessage(code, message)} Your completed strokes are preserved. Restore the renderer to continue.`),
            true,
            code
          );
        },
        {
          readTile: tileStore.read,
          overviewStorage: tileStore.overviews,
          virtualTexture: true,
          onRefine: scheduleDraw,
          onPaintProgress: async () => {
            // One pointer segment can contain hundreds of dependent sampling dabs.
            // Present only after a whole dab, without enqueueing behind the stroke itself.
            if (strokeSession && active && !lost && performance.now() - presentedAt >= progressFrameInterval) await draw();
          },
          onError: failure
        }
      );
      lost = false;
      renderer.setSelection(selectionPoints, selectionAnimate);
      renderer.setFloating(floating);
      await renderer.prepareOverview(document.layers);
      await tileStore.save(snapshotDocument(document.layers, document.active.id, camera, featureData));
    };
    onCleanup(() => {
      active = false;
      stopIdle();
      clearTimeout(selectionTimer);
      clearTimeout(collectTimer);
      clearTimeout(renderTimer);
      clearTimeout(saveTimer);
      clearTimeout(viewTimer);
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
      if (command.type === 'watch-regions') {
        watched = { regions: command.regions, revision: -1, layers: {} };
        status();
        return;
      }
      if (command.type === 'view' && renderer) {
        camera = command.camera;
        size = command.size;
        dpr = command.dpr;
        viewChanged();
        scheduleDraw();
        return;
      }
      // Merge only consecutive, not-yet-started input packets. Keep every point and pressure,
      // but render their latest state once after GPU backpressure clears. Commands such as
      // end/cancel/begin seal the batch so points never cross a stroke boundary.
      if (command.type === 'diagnostics') {
        diagnostics = command.enabled;
        return;
      }
      if (command.type === 'begin' || command.type === 'samples') receivedInputTime = command.samples.at(-1)?.time;
      if (command.type === 'samples' && pendingSamples) {
        for (const sample of command.samples) pendingSamples.samples.push(sample);
        return;
      }
      // Later packets append to this batch, so it must not share the caller's array.
      if (command.type === 'samples') command = { ...command, samples: [...command.samples] };
      pendingSamples = command.type === 'samples' ? command : undefined;
      enqueue(async () => {
        if (pendingSamples === command) pendingSamples = undefined;
        switch (command.type) {
          case 'init': {
            diagnostics = command.diagnostics ?? false;
            canvas = command.canvas;
            storageName = command.storageName ?? 'paint-studio';
            size = command.size;
            dpr = command.dpr;
            tileStore = await modules.storage(storageName);
            const previous = await tileStore.load();
            if (previous) {
              document.replace(previous.layers, previous.activeId);
              camera = previous.camera;
              featureData = restoreFeatureData(modules.features, previous.features);
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
          case 'feature': {
            const feature = modules.features.find((candidate) => candidate.id === command.feature);
            if (!feature?.apply) throw new Error(`Document feature "${command.feature}" does not accept commands.`);
            const next = feature.apply(featureData[feature.id], command.command);
            await end();
            featureData = { ...featureData, [feature.id]: next };
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
          case 'adaptive-quality':
            adaptiveQuality = command.enabled;
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
            if (moved) viewChanged();
            scheduleDraw();
            break;
          }
          case 'begin': {
            processedInputTime = undefined;
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
            const strokeRenderer = modules.features.reduce(
              (decorated, feature) =>
                feature.decorateStroke?.({ data: featureData[feature.id], brush: command.brush, renderer: decorated }) ??
                decorated,
              renderer
            );
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
                adaptiveQuality,
                lod: renderer!.brushLod?.(document.layers, document.active, camera, size, dpr) ?? 0,
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
          case 'redo': {
            cancel();
            const restored = command.type === 'undo' ? document.undo() : document.redo();
            if (restored) {
              renderer?.restore(restored, document.layers);
              await renderer?.prepareOverview(document.layers);
            }

            changed();
            break;
          }
          case 'layer': {
            await end();
            const before = [...document.layers];
            const merged = command.action.type === 'merge-down' ? await mergeDown(command.action.id) : undefined;
            if (command.action.type !== 'merge-down') document.changeLayer(command.action);
            // Selection changes no pixels or composition. Other actions recomposite; only a deleted
            // layer's resident tiles are released, and every other layer's GPU cache survives.
            if (command.action.type !== 'select' && renderer) {
              for (const layer of before) {
                if (!document.layers.includes(layer)) renderer.releaseLayer(layer.id);
              }
              if (merged) renderer.restore(merged, document.layers);
              renderer.recomposite();
              await renderer.prepareOverview(document.layers);
            }
            changed();
            break;
          }
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
              const storage = { read: tileStore.read, write: stage };
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
              renderer.restore(changes, document.layers);
              // Mark the committed edit dirty even if preparing derived GPU pages fails.
              changed();
              await renderer.prepareOverview(document.layers);
            } finally {
              editingSelection = false;
              scheduleCollect();
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
                snapshotDocument(document.layers, document.active.id, camera, featureData),
                tileStore.read
              ),
              name: 'drawing.paint',
              requestId: command.requestId
            });
            break;
          case 'pick-color': {
            const sample = command.sample ?? defaultColorSample;
            const result = await attempt(async (): Promise<string | null> => {
              if (!primaryAttached || !renderer || lost) throw new Error('The drawing engine is not ready.');
              if (sample.exact) await end();
              if (sample.source === 'layer') {
                return sampleLayer(document.active, screenToWorld(command.point, camera, size), sample.size, (pixels) =>
                  pixels instanceof Uint8Array ? Promise.resolve(pixels) : tileStore.read(pixels)
                );
              }
              if (sample.exact) await draw(true);
              return averageOpaque(await renderer.readPresentedArea(command.point, size, sample.size));
            });
            post({
              type: 'picked-color',
              requestId: command.requestId,
              result: result.ok ? result : { ok: false, error: result.error.message }
            });
            break;
          }
          case 'png':
            if (!primaryAttached) throw new Error('Attach a primary canvas before exporting the view.');
            await end();
            if (command.region) {
              post({
                type: 'download',
                blob: await regionPng(renderer!, document.layers, command.region),
                name: command.name ?? 'drawing-region.png',
                requestId: command.requestId
              });
              break;
            }
            await draw(true);
            post({
              type: 'download',
              blob: await presentedPng(renderer!),
              name: 'drawing-view.png',
              requestId: command.requestId
            });
            break;
          case 'psd':
            await end();
            post({
              type: 'download',
              blob: await writePsdFile(document.layers, tileStore.read, command.region),
              name: command.name ?? 'drawing.psd',
              requestId: command.requestId
            });
            break;
          case 'edit': {
            const result = await attempt(() => runEdit(command));
            if (command.requestId !== undefined) {
              post({
                type: 'edited',
                requestId: command.requestId,
                result: result.ok ? result : { ok: false, error: result.error.message }
              });
            } else if (!result.ok) {
              throw result.error;
            }

            break;
          }
          case 'import': {
            importing = true;
            clearTimeout(collectTimer);
            try {
              const next =
                'file' in command
                  ? (await isPsdFile(command.file))
                    ? await readPsdFile(command.file, size, stage)
                    : await readPaintFile(command.file, stage)
                  : decodeDocument(command.text);
              await tileStore.flush();
              cancel();
              document.replace(next.layers, next.activeId);
              camera = next.camera;
              featureData = restoreFeatureData(modules.features, next.features);
              editStates.clear();
              lastEdit = undefined;
              floating = undefined;
              renderer?.setFloating(undefined);
              document.persist(tileStore.capture);
              renderer?.reset();
              await renderer?.prepareOverview(document.layers);
              post({ type: 'restored', camera, features: reportedFeatures() });
              changed();
            } finally {
              importing = false;
              if (!saved) scheduleSave();
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
              if (moved && tileStore) viewChanged();
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

/** Encodes the presented view as PNG from a GPU readback; the WebGPU canvas itself cannot be read after presenting. */
/** Renders a document rectangle at 100% into its own target and encodes it as a PNG. */
async function regionPng(renderer: PaintRenderer, layers: Layer[], region: DocumentRect): Promise<Blob> {
  const target = new OffscreenCanvas(1, 1);
  const camera = { x: region.left + region.width / 2, y: region.top + region.height / 2, zoom: 1, angle: 0, mirrored: false };
  try {
    await renderer.render(layers, camera, { width: region.width, height: region.height }, 1, true, target);
    return await presentedPng(renderer, target);
  } finally {
    renderer.releaseTarget(target);
  }
}

async function presentedPng(renderer: PaintRenderer, target?: OffscreenCanvas): Promise<Blob> {
  const { width, height, data } = await renderer.readPresented(target);
  const image = new OffscreenCanvas(width, height);
  const context = image.getContext('2d');
  if (!context) throw new Error('Could not export the canvas.');
  context.putImageData(new ImageData(data, width, height), 0, 0);
  return image.convertToBlob({ type: 'image/png' });
}

/** Names the failure class so a validation bug is not reported to the user as a disconnected device. */
function rendererFailureMessage(code: GpuError['code'], message: string) {
  if (code === 'validation') {
    return `The renderer stopped after a graphics validation error: ${message}`;
  }

  return message;
}

/** At most 60 intermediate redraws per second; first contact and packet completion still present immediately. */
const progressFrameInterval = 16;

/** Autosave waits for this pause after a change, so consecutive strokes share one checkpoint. */
const saveDelay = 300;

/** Garbage collection of old tile versions waits this long after a save or selection edit. */
const collectDelay = 5000;

/** Selection edits and imports flush captured tiles to IndexedDB once this many bytes are pending. */
const stagedFlushBytes = 8 * 1048576;
