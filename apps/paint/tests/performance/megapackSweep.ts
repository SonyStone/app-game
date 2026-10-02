import type { BrushAsset } from '@app-game/abr-brush/library';
import { loadBrushLibrary } from '@app-game/abr-brush/library';
import { prepareAbrBrush } from '@app-game/abr-paint/preset';
import { initAbr } from '@app-game/abr-parser';
import { defaultBrush, type Brush, type Sample } from '@app-game/paint-core/brush';
import type { PaintCommand, PaintEvent } from '@app-game/paint-core/protocol';
import PaintWorker from '../../src/features/engine/paint.worker?worker';
import { createMainThreadEndpoint, type PaintEndpoint } from '../browser/mainThreadEndpoint';

/**
 * Device sweep over every preset of an ABR library through the production worker: one long pen stroke per preset and
 * zoom, drawn across the visible screen, so document distance and touched tiles grow as the view zooms out.
 *
 * The library is parsed once per page and kept for later calls. Each call starts a worker with its own disposable
 * IndexedDB database, measures the requested presets and deletes the database. Never opens saved artwork.
 */
export async function measureMegapackSweep(fixture: Blob | undefined, options: SweepOptions): Promise<SweepRow[]> {
  const brushes = await library(fixture);
  const rows: SweepRow[] = [];
  const engine = await startEngine(options.view, options.mainThread);
  try {
    for (const index of options.presets) {
      const asset = brushes[index];
      if (!asset) {
        continue;
      }

      rows.push(...(await measurePreset(engine, asset, index, options)));
    }
  } finally {
    await engine.stop();
  }

  return rows;
}

/** Number of presets in the loaded library. */
export async function megapackPresetCount(fixture?: Blob) {
  return (await library(fixture)).length;
}

/** What to measure. Distances and speeds are in CSS pixels of the view, as a pen would move over the screen. */
export type SweepOptions = {
  /** Preset indices in library order. */
  presets: number[];
  zooms: number[];
  /** View size and device pixel ratio of the editor being reproduced. */
  view: { width: number; height: number; dpr: number };
  /** Length of the stroke on screen. */
  screenDistance: number;
  /** Pen speed on screen in pixels per second; sets sample spacing at 240 Hz and the real-time factor. */
  penSpeed: number;
  /** Sends samples on the pen's clock instead of all at once, and reports how far drawing lags behind the pen. */
  paced?: boolean;
  /** Runs the engine on the page's thread instead of the production worker, so a page CPU profile covers it. */
  mainThread?: boolean;
  /** A run is abandoned, and the worker restarted, after this long. */
  timeoutMs: number;
};

/** One preset at one zoom. Times are wall-clock milliseconds seen by the page. */
export type SweepRow = {
  index: number;
  name: string;
  zoom: number;
  /** Document LOD implied by the zoom and backing scale; the engine may choose a coarser occupied page. */
  lod: number;
  size: number;
  features: PresetFeatures;
  /** Stroke length in document pixels. */
  documentDistance: number;
  /** Time the pen needs for the stroke at `penSpeed`. */
  penMs: number;
  /** Pen-down until every sample is presented. Unpaced runs measure throughput, paced runs include the pen's own time. */
  drawMs: number;
  /** Pen-up until the stroke is committed and the next stroke is accepted. */
  finishMs: number;
  /** Pen-down until the stroke is committed. */
  totalMs: number;
  /** Wall-clock time of the measurement, for relating rows to device temperature. */
  at: number;
  /** `drawMs / penMs` of an unpaced run: above 1 the engine cannot keep up with the pen. */
  realTimeFactor: number;
  frames: number;
  /** Longest interval between presented frames while drawing. */
  maxFrameGapMs: number;
  /** Paced runs: worst and final delay between a sample's pen time and the frame that shows it. */
  maxLagMs?: number;
  tiles: number;
  error?: string;
};

type PresetFeatures = ReturnType<typeof presetFeatures>;

async function measurePreset(engine: Engine, asset: BrushAsset, index: number, options: SweepOptions) {
  const rows: SweepRow[] = [];
  const failed = (zoom: number, error: unknown, features = unknownFeatures, size = 0): SweepRow => ({
    index,
    name: asset.name,
    zoom,
    lod: viewLod(zoom, options.view.dpr),
    size,
    features,
    documentDistance: options.screenDistance / zoom,
    penMs: (options.screenDistance / options.penSpeed) * 1000,
    drawMs: 0,
    finishMs: 0,
    totalMs: 0,
    at: Date.now(),
    realTimeFactor: 0,
    frames: 0,
    maxFrameGapMs: 0,
    tiles: 0,
    error: error instanceof Error ? error.message : String(error)
  });

  let prepared: ReturnType<typeof prepareAbrBrush>;
  try {
    prepared = prepareAbrBrush(asset);
    await engine.upload(prepared.resources);
  } catch (error) {
    return options.zooms.map((zoom) => failed(zoom, error));
  }

  const features = presetFeatures(prepared);
  const brush: Brush = {
    ...defaultBrush(),
    backgroundColor: prepared.backgroundColor ?? '#ffffff',
    engine: { ...prepared.engine, settings: { ...prepared.engine.settings, seed: 12345 } },
    size: prepared.size,
    spacing: prepared.spacing,
    ...(prepared.color === undefined ? {} : { color: prepared.color }),
    ...(prepared.flow === undefined ? {} : { flow: prepared.flow }),
    ...(prepared.opacity === undefined ? {} : { opacity: prepared.opacity })
  };

  for (const zoom of options.zooms) {
    try {
      // Retouch tools and erasers need ink to work on; lay a wide round stroke under the same path first.
      if (features.samplesCanvas || features.tool === 'ErTl') {
        const base = { ...defaultBrush(), color: '#b5452f', flow: 1, size: Math.min(512, Math.max(96, prepared.size * 2)) };
        await engine.stroke(base, zoom, { ...options, paced: false });
      }

      const run = await engine.stroke(brush, zoom, options);
      const penMs = (options.screenDistance / options.penSpeed) * 1000;
      rows.push({
        index,
        name: asset.name,
        zoom,
        lod: viewLod(zoom, options.view.dpr),
        size: prepared.size,
        features,
        documentDistance: options.screenDistance / zoom,
        penMs,
        ...run,
        at: Date.now(),
        realTimeFactor: run.drawMs / penMs
      });
      await engine.clear();
    } catch (error) {
      rows.push(failed(zoom, error, features, prepared.size));
      await engine.restart();
      await engine.upload(prepared.resources);
    }
  }

  return rows;
}

type Engine = Awaited<ReturnType<typeof startEngine>>;

/** Starts the production worker on an offscreen canvas of the editor's size, with frame timing enabled. */
async function startEngine(view: SweepOptions['view'], mainThread = false) {
  let worker: Worker | PaintEndpoint;
  let storageName = '';
  let listeners = new Set<(event: PaintEvent) => void>();
  let latest: Extract<PaintEvent, { type: 'state' }> | undefined;
  let requests = 0;
  let strokes = 0;

  const send = (command: PaintCommand, transfer: Transferable[] = []) =>
    (worker as PaintEndpoint).postMessage(command, transfer);

  /** Resolves once the worker has finished every command sent so far; commands are processed in order. */
  const settled = (timeoutMs: number) => {
    const requestId = `sweep-${requests++}`;
    const reply = next((event) => event.type === 'brush-resources' && event.requestId === requestId, timeoutMs);
    send({ type: 'brush-resources', requestId, action: 'stats' });
    return reply;
  };

  /** Next event satisfying `matches`; an `error` event rejects. */
  const next = (matches: (event: PaintEvent) => boolean, timeoutMs = 30_000) =>
    new Promise<PaintEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(receive);
        reject(new Error(`Timed out after ${timeoutMs} ms.`));
      }, timeoutMs);
      const receive = (event: PaintEvent) => {
        if (event.type !== 'error' && !matches(event)) {
          return;
        }

        clearTimeout(timer);
        listeners.delete(receive);
        if (event.type === 'error') {
          reject(new Error(event.message));
        } else {
          resolve(event);
        }
      };
      listeners.add(receive);
    });

  const start = async () => {
    storageName = `paint-megapack-sweep-${crypto.randomUUID()}`;
    listeners = new Set();
    latest = undefined;
    worker = mainThread ? createMainThreadEndpoint() : new PaintWorker();
    worker.onmessage = ({ data }: MessageEvent<PaintEvent>) => {
      if (data.type === 'state') {
        latest = data;
      }

      for (const receive of [...listeners]) {
        receive(data);
      }
    };
    worker.onerror = (event) => {
      for (const receive of [...listeners]) {
        receive({ type: 'error', message: event.message || 'The paint worker stopped.', recoverable: false });
      }
    };
    const ready = next((event) => event.type === 'ready', 120_000);
    const canvas = new OffscreenCanvas(Math.round(view.width * view.dpr), Math.round(view.height * view.dpr));
    send(
      {
        type: 'init',
        canvas,
        size: { width: view.width, height: view.height },
        dpr: view.dpr,
        storageName,
        diagnostics: true
      },
      [canvas]
    );
    await ready;
  };

  const stop = async () => {
    const disposed = next((event) => event.type === 'disposed', 20_000).catch(() => undefined);
    send({ type: 'dispose' });
    await disposed;
    worker.terminate();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(storageName);
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  };

  await start();

  return {
    stop,

    /** Replaces a stuck or failed worker and its database. Uploaded resources must be sent again. */
    async restart() {
      worker.terminate();
      const abandoned = storageName;
      await start();
      indexedDB.deleteDatabase(abandoned);
    },

    async upload(resources: ReturnType<typeof prepareAbrBrush>['resources']) {
      for (const resource of resources) {
        const requestId = `sweep-${requests++}`;
        const reply = next((event) => event.type === 'brush-resources' && event.requestId === requestId, 60_000);
        send({ type: 'brush-resources', requestId, action: 'put', resource });
        const event = await reply;
        if (event.type === 'brush-resources' && !event.result.ok) {
          throw new Error(event.result.error);
        }
      }
    },

    /** Draws one stroke along the sweep path at `zoom` and waits until it is committed. */
    async stroke(brush: Brush, zoom: number, options: SweepOptions) {
      // Each stroke gets its own span of the input clock, so a late frame of an earlier stroke is ignored.
      const epoch = ++strokes * 1_000_000;
      const samples = strokePath(view, zoom, options).map((sample) => ({ ...sample, time: sample.time + epoch }));
      const size = { width: view.width, height: view.height };
      send({ type: 'view', camera: { x: 0, y: 0, zoom, angle: 0, mirrored: false }, size, dpr: view.dpr });

      let frames = 0;
      let lastFrame = 0;
      let maxFrameGapMs = 0;
      let maxLagMs = 0;
      let drawn = 0;
      const lastTime = samples.at(-1)!.time;
      let started = 0;
      const receive = (event: PaintEvent) => {
        if (event.type !== 'frame' || drawn) {
          return;
        }

        if (event.processedInputTime !== undefined && event.processedInputTime < epoch) {
          return;
        }

        const now = performance.now();
        frames++;
        if (lastFrame) {
          maxFrameGapMs = Math.max(maxFrameGapMs, now - lastFrame);
        }

        lastFrame = now;
        if (options.paced && event.processedInputTime !== undefined) {
          maxLagMs = Math.max(maxLagMs, now - started - (event.processedInputTime - epoch));
        }

        if (event.processedInputTime !== undefined && event.processedInputTime >= lastTime) {
          drawn = now;
        }
      };
      listeners.add(receive);
      try {
        started = performance.now();
        send({ type: 'begin', brush, zoom, samples: [samples[0]!] });
        if (options.paced) {
          await sendOnPenClock(samples, started, send);
        } else {
          send({ type: 'samples', samples: samples.slice(1) });
        }

        const released = performance.now();
        send({ type: 'end' });
        // A stroke that changes no pixels commits nothing, so wait for the command queue instead of a revision.
        await settled(options.timeoutMs);
        const finished = performance.now();
        // The last frame's GPU completion can be reported just after the commit of a short stroke.
        for (let waited = 0; !drawn && waited < 250; waited += 10) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        const drawEnd = Math.min(drawn || finished, finished);
        return {
          drawMs: drawEnd - started,
          finishMs: finished - Math.max(drawEnd, released),
          totalMs: finished - started,
          frames,
          maxFrameGapMs,
          ...(options.paced ? { maxLagMs } : {}),
          tiles: latest?.document.tileCount ?? 0
        };
      } finally {
        listeners.delete(receive);
      }
    },

    /** Undoes every stroke and waits for the autosave, so the next run starts from an empty, idle document. */
    async clear() {
      while (latest?.document.canUndo) {
        send({ type: 'undo' });
        await settled(60_000);
      }

      if (latest?.saveState !== 'saved') {
        await next((event) => event.type === 'state' && event.saveState === 'saved', 60_000);
      }
    }
  };
}

/** Sends the remaining samples in animation-frame batches as the pen clock reaches them. */
async function sendOnPenClock(samples: Sample[], started: number, send: (command: PaintCommand) => void) {
  let sent = 1;
  while (sent < samples.length) {
    await new Promise((resolve) => setTimeout(resolve, 8));
    const elapsed = performance.now() - started;
    let until = sent;
    while (until < samples.length && samples[until]!.time - samples[0]!.time <= elapsed) {
      until++;
    }

    if (until > sent) {
      send({ type: 'samples', samples: samples.slice(sent, until) });
      sent = until;
    }
  }
}

/**
 * A pen path over the screen in document coordinates: horizontal passes with a sine wobble, top to bottom, inside the
 * middle 80% of the view centered on the document origin. Pressure and tilt vary smoothly; sample times follow the pen.
 */
function strokePath(view: SweepOptions['view'], zoom: number, options: SweepOptions): Sample[] {
  const step = options.penSpeed / 240;
  const count = Math.max(2, Math.round(options.screenDistance / step));
  const width = view.width * 0.8;
  const passes = Math.max(1, Math.ceil(options.screenDistance / width));
  const rowGap = (view.height * 0.6) / passes;
  return Array.from({ length: count }, (_, index) => {
    const travelled = index * step;
    const pass = Math.min(passes - 1, Math.floor(travelled / width));
    const along = travelled - pass * width;
    const x = (pass % 2 ? width - along : along) - width / 2;
    const y = (pass + 0.5) * rowGap - (view.height * 0.6) / 2 + Math.sin(travelled / 60) * rowGap * 0.3;
    return {
      x: x / zoom,
      y: y / zoom,
      pressure: 0.675 + 0.325 * Math.sin(travelled / 170),
      tiltX: 25 + 15 * Math.sin(travelled / 300),
      tiltY: 20 * Math.cos(travelled / 230),
      pointerType: 'pen',
      time: (travelled / options.penSpeed) * 1000
    };
  });
}

/** Settings that select a rendering path or multiply stamp work, for grouping results. */
function presetFeatures(prepared: ReturnType<typeof prepareAbrBrush>) {
  const { values, blendMode, patternId, dualId } = prepared.engine.settings;
  const tool = values.tool.type;
  return {
    tool,
    tipKind: values.tipKind,
    blendMode,
    spacing: values.spacing,
    samplesCanvas: tool === 'SmTl' || tool === 'MixB' || tool === 'BlTl' || tool === 'ShTl',
    shapeDynamics: values.useShapeDynamics,
    projection: values.useShapeDynamics && values.shapeDynamics.brushProjection,
    scatterCount: values.useScattering ? values.scattering.count : 0,
    texture: values.useTexture && !!patternId,
    textureEachTip: values.useTexture && !!patternId && values.texture.eachTip,
    dual: values.useDualBrush && !!dualId,
    colorDynamics: values.useColorDynamics,
    transfer: values.useTransfer,
    noise: values.useNoise,
    wetEdges: values.useWetEdges,
    buildUp: values.useBuildUp,
    tipPixels: prepared.resource.width * prepared.resource.height
  };
}

const unknownFeatures = undefined as unknown as PresetFeatures;

/** The renderer's view LOD: one level per halving of backing pixels per document pixel. */
function viewLod(zoom: number, dpr: number) {
  return Math.max(0, Math.floor(-Math.log2(zoom * Math.min(dpr, 2))));
}

let loaded: Promise<readonly BrushAsset[]> | undefined;

/** Parses the fixture once per page; later calls reuse it and need no fixture. */
function library(fixture: Blob | undefined) {
  loaded ??= (async () => {
    if (!fixture) {
      throw new Error('The first call needs the ABR fixture.');
    }

    await initAbr();
    return loadBrushLibrary(await fixture.arrayBuffer()).brushes;
  })();
  return loaded;
}
