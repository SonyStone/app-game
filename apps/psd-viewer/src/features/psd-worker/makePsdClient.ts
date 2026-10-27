import type {
  PsdDifference,
  PsdDocumentFonts,
  PsdImage,
  PsdInfo,
  PsdLayerDetail,
  PsdLayerNode,
  PsdLayerPixels,
  PsdOpenAnswers,
  PsdOpening,
  PsdRegionCapability,
  PsdRegionRect,
  PsdRenderSettings,
  PsdSavedPath,
  PsdSavedProcessChannels,
  PsdStates,
  PsdTextSupport
} from '@app-game/psd/viewer';
import type { EditingRequest, EditingResponse, EditingResult } from '../editing/contracts';
import type { SessionFont } from '../fonts/addFontFile';
import { performanceEnabled, viewerPerformance } from '../telemetry/performance';
import type {
  BlendingDetection,
  PsdReply,
  PsdRequest,
  PsdResultOf,
  RenderedPixels,
  WindowPixels,
  WindowRequest,
  WorkerFailure
} from './protocol';

/**
 * Talks to a PSD worker: each call posts one request and resolves with its reply as a typed result. Renders are
 * coalesced: one runs at a time, and a render requested while another runs waits as the only queued render, replacing
 * (and resolving as `superseded`) any render queued before it, so quick visibility toggles never pile up work. Other
 * requests go straight to the worker, which answers in arrival order. A crashed worker rejects every pending and later
 * call. With a replacement factory, `restart` settles old calls as superseded and starts a clean worker, replaying
 * caller-supplied font bytes. `dispose` terminates the worker and releases retained inputs; pending calls settle as superseded.
 */
export function makePsdClient(worker: PsdWorkerPort, replacement?: () => PsdWorkerPort) {
  const pending = new Map<number, { resolve: (reply: PsdReply) => void; reject: (error: Error) => void }>();
  let memory = { wasmBytes: 0, sourceBytes: 0 };
  let nextId = 0;
  let epoch = 0;
  const fontInputs: { fonts: ArrayBuffer[]; sources?: string[] }[] = [];
  let crash: Error | undefined;
  let rendering = false;
  let queued: { request: RenderRequest; settle: (reply: PsdReply) => void; reject: (error: Error) => void } | undefined;

  attach();

  function attach() {
    worker.onmessage = (event) => {
      if (event.data.memory) {
        memory = event.data.memory;
      }

      const entry = pending.get(event.data.id);
      if (entry) {
        pending.delete(event.data.id);
        const posted = event.data.performance?.find((sample) => sample.name === 'transfer.postedAt');
        if (posted?.value !== undefined) {
          viewerPerformance.record('transfer.delivery', posted.value - performance.timeOrigin);
        }

        entry.resolve(event.data);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      fail(new Error(event.message || 'The PSD worker stopped'));
    };
    worker.onmessageerror = () => fail(new Error('A PSD worker message could not be read'));
  }

  /** Replaces a busy worker immediately, settling old calls and restoring supplied session fonts. */
  function restart() {
    if (!replacement) {
      return;
    }

    epoch++;
    viewerPerformance.record('cancellation.pending', performance.now(), pending.size);
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    const canceled: PsdReply = {
      id: 0,
      type: 'failed',
      error: { kind: 'superseded', message: 'Document operation canceled' }
    };
    for (const entry of pending.values()) {
      entry.resolve(canceled);
    }

    pending.clear();
    queued?.settle(canceled);
    queued = undefined;
    rendering = false;
    crash = undefined;
    worker = replacement();
    attach();
    for (const input of fontInputs) {
      const replay = input.fonts.map((bytes) => bytes.slice(0));
      void send({ type: 'addFonts', fonts: replay, sources: input.sources }, replay);
    }

    viewerPerformance.record('cancellation.workerRestart', performance.now(), 1);
  }

  /**
   * Opens `bytes` as Photoshop does, with `answers` to its prompts; the bytes are transferred to the worker, which
   * closes the document it held before. A prompt Photoshop shows that `answers` leaves unanswered fails as
   * `needsAnswer` with the prompt: open again with its answer.
   */
  async function open(
    bytes: ArrayBuffer | Blob,
    answers: PsdOpenAnswers = {},
    mode?: 'strict' | 'source'
  ): Promise<PsdResultOf<OpenedPsd>> {
    const reply = await send({ type: 'open', bytes, answers, mode }, bytes instanceof ArrayBuffer ? [bytes] : []);
    return reply.type === 'opened'
      ? {
          ok: true,
          value: {
            document: reply.document,
            info: { ...reply.info, windowed: reply.windowed },
            layers: reply.layers,
            states: reply.states,
            opening: reply.opening,
            windowed: reply.windowed,
            sourceBacked: reply.sourceBacked,
            capability: reply.capability,
            sourceLayerFailure: reply.sourceLayerFailure
          }
        }
      : failure(reply);
  }

  /** Renders the open document `document` with `settings` and visibility overrides. */
  async function render(
    document: number,
    settings: PsdRenderSettings,
    visibility: [number, boolean][]
  ): Promise<PsdResultOf<RenderedPixels>> {
    const reply = await scheduleRender({ type: 'render', document, settings: { ...settings }, visibility });
    return reply.type === 'rendered' ? { ok: true, value: reply.render } : failure(reply);
  }

  /**
   * Renders a bounded window through the same single-flight queue as whole renders. Aborting removes queued work and
   * discards an in-flight reply. A synchronous WASM call already running finishes before the newest request starts.
   */
  async function renderWindow(
    document: number,
    settings: PsdRenderSettings,
    visibility: [number, boolean][],
    window: WindowRequest,
    signal: AbortSignal,
    liveBytes?: number
  ): Promise<PsdResultOf<{ images: WindowPixels[]; milliseconds: number }>> {
    const reply = await scheduleRender(
      { type: 'renderWindow', document, settings: { ...settings }, visibility, window, liveBytes },
      signal
    );
    return reply.type === 'windowRendered'
      ? { ok: true, value: { images: reply.images, milliseconds: reply.milliseconds } }
      : failure(reply);
  }

  function scheduleRender(request: RenderRequest, signal?: AbortSignal): Promise<PsdReply> {
    return new Promise((resolve, reject) => {
      const superseded: PsdReply = {
        id: 0,
        type: 'failed',
        error: { kind: 'superseded', message: 'a newer render replaced this one' }
      };
      const cleanup = () => signal?.removeEventListener('abort', abort);
      const job = {
        request,
        settle(reply: PsdReply) {
          cleanup();
          resolve(reply);
        },
        reject(error: Error) {
          cleanup();
          reject(error);
        }
      };
      const abort = () => {
        viewerPerformance.record('cancellation', performance.now(), 1);
        if (queued === job) {
          queued = undefined;
        }

        job.settle(superseded);
      };
      if (signal?.aborted) {
        abort();
        return;
      }

      signal?.addEventListener('abort', abort, { once: true });
      queued?.settle(superseded);
      queued = job;
      startRender();
    });
  }

  /** Photoshop's saved merged image. */
  async function merged(document: number): Promise<PsdResultOf<PsdImage>> {
    const reply = await send({ type: 'merged', document });
    return reply.type === 'merged' ? { ok: true, value: reply.image } : failure(reply);
  }

  /** The comparison of render `render` with the merged image; `stale` once a newer render replaced it. */
  async function difference(document: number, render: number): Promise<PsdResultOf<PsdDifference>> {
    const reply = await send({ type: 'difference', document, render });
    return reply.type === 'difference' ? { ok: true, value: reply.difference } : failure(reply);
  }

  /**
   * Which gamma blending setting reproduces the document's merged image, rendering with `settings` both ways. The
   * worker keeps both renders, so a following `render` with either setting and the same visibility reuses one.
   */
  async function detectBlending(
    document: number,
    settings: PsdRenderSettings,
    visibility: [number, boolean][]
  ): Promise<PsdResultOf<BlendingDetection>> {
    const reply = await send({ type: 'detectBlending', document, settings: { ...settings }, visibility });
    return reply.type === 'blending' ? { ok: true, value: reply.detection } : failure(reply);
  }

  /** Returns unchanged bytes retained at open, independent of recovery, rendering or view overrides. */
  async function original(document: number): Promise<PsdResultOf<Blob>> {
    const reply = await send({ type: 'original', document });
    return reply.type === 'original' ? { ok: true, value: reply.bytes } : failure(reply);
  }

  /** Reads saved native channel planes on demand, subject to worker admission. */
  async function channels(document: number, rect?: PsdRegionRect): Promise<PsdResultOf<PsdSavedProcessChannels>> {
    const reply = await send({ type: 'channels', document, rect });
    return reply.type === 'channels' ? { ok: true, value: reply.channels } : failure(reply);
  }

  /** Lists typed saved path carriers; never parses descriptors in the UI. */
  async function paths(document: number): Promise<PsdResultOf<PsdSavedPath[]>> {
    const reply = await send({ type: 'paths', document });
    return reply.type === 'paths' ? { ok: true, value: reply.paths } : failure(reply);
  }

  /** One layer's saved-record detail and admitted RGB8 pixels. */
  async function layer(document: number, index: number, rect?: PsdRegionRect): Promise<PsdResultOf<LayerContents>> {
    const reply = await send({ type: 'layer', document, index, rect });
    return reply.type === 'layer'
      ? { ok: true, value: { detail: reply.detail, pixels: reply.pixels } }
      : failure(reply);
  }

  /** Preflights current settings and returns typed storage causes without rendering pixels. */
  async function capability(document: number, settings: PsdRenderSettings, visibility: [number, boolean][]) {
    const reply = await send({ type: 'capability', document, settings, visibility });
    return reply.type === 'capability'
      ? { ok: true as const, value: { plan: reply.capability, windowed: reply.windowed } }
      : failure(reply);
  }

  /** Reads a native current/saved comparison window without converting through display RGB8. */
  async function inspect(
    document: number,
    rect: PsdRegionRect,
    settings: PsdRenderSettings,
    visibility: [number, boolean][]
  ) {
    const reply = await send({ type: 'inspect', document, rect, settings, visibility });
    return reply.type === 'inspect'
      ? { ok: true as const, value: { saved: reply.saved, current: reply.current } }
      : failure(reply);
  }

  /**
   * Adds font files to the worker's font library, transferring their buffers; resolves with each file's faces or why
   * it was refused, in order, and the library after adding.
   */
  async function addFonts(
    fonts: ArrayBuffer[],
    sources?: string[]
  ): Promise<PsdResultOf<{ results: PsdResultOf<SessionFont[]>[]; fonts: SessionFont[] }>> {
    const retained = { fonts: fonts.map((bytes) => bytes.slice(0)), sources };
    const reply = await send({ type: 'addFonts', fonts, sources }, fonts);
    if (reply.type === 'fontsAdded') {
      const accepted = reply.results.flatMap((result, index) => (result.ok ? [index] : []));
      if (accepted.length) {
        fontInputs.push({
          fonts: accepted.map((index) => retained.fonts[index]),
          sources: retained.sources ? accepted.map((index) => retained.sources![index]) : undefined
        });
      }
    }

    return reply.type === 'fontsAdded'
      ? { ok: true, value: { results: reply.results, fonts: reply.fonts } }
      : failure(reply);
  }

  /** The fonts in the worker's font library, sorted by PostScript name. */
  async function fonts(): Promise<PsdResultOf<SessionFont[]>> {
    const reply = await send({ type: 'listFonts' });
    return reply.type === 'fonts' ? { ok: true, value: reply.fonts } : failure(reply);
  }

  /** The document's fonts, their availability, and supplied releases differing from the recorded versions. */
  async function documentFonts(document: number): Promise<PsdResultOf<PsdDocumentFonts>> {
    const reply = await send({ type: 'documentFonts', document });
    return reply.type === 'documentFonts' ? { ok: true, value: reply.report } : failure(reply);
  }

  /**
   * Whether type layer record `index` re-renders from its text with the worker's library; `null` for other records.
   * The worker re-renders the layer once to decide and reports supplied release mismatches separately from missing fonts.
   */
  async function textSupport(document: number, index: number): Promise<PsdResultOf<PsdTextSupport | null>> {
    const reply = await send({ type: 'textSupport', document, index });
    return reply.type === 'textSupport' ? { ok: true, value: reply.support } : failure(reply);
  }

  function dispose() {
    epoch++;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    for (const entry of pending.values()) {
      entry.resolve({ id: 0, type: 'failed', error: { kind: 'superseded', message: 'Worker disposed' } });
    }
    queued?.settle({ id: 0, type: 'failed', error: { kind: 'superseded', message: 'Worker disposed' } });
    pending.clear();
    fontInputs.length = 0;
    queued = undefined;
  }

  function startRender() {
    if (rendering || !queued) {
      return;
    }

    const generation = epoch;
    const job = queued;
    queued = undefined;
    rendering = true;
    send(job.request)
      .then(job.settle, job.reject)
      .finally(() => {
        if (generation !== epoch) {
          return;
        }

        rendering = false;
        startRender();
      });
  }

  function send(request: DistributiveOmit<PsdRequest, 'id'>, transfer: Transferable[] = []): Promise<PsdReply> {
    if (crash) {
      return Promise.reject(crash);
    }

    const id = ++nextId;
    const sent = performance.now();
    return new Promise((resolve, reject) => {
      pending.set(id, {
        resolve: (reply) => {
          viewerPerformance.record(`request.latency.${request.type}`, sent);
          resolve(reply);
        },
        reject
      });
      worker.postMessage({ ...request, id, telemetry: performanceEnabled() } as PsdRequest, transfer);
    });
  }

  function fail(error: Error) {
    crash = error;
    for (const entry of pending.values()) {
      entry.reject(error);
    }

    pending.clear();
    queued?.reject(error);
    queued = undefined;
  }

  return {
    open,
    capability,
    inspect,
    render,
    renderWindow,
    /** Editor operations share the worker lifetime; frozen saves use independent IDs. */
    async editor(document: number, request: EditingRequest): Promise<EditingResult<EditingResponse>> {
      const reply = await send({ type: 'editor', document, request });
      return reply.type === 'editor'
        ? reply.result
        : {
            ok: false,
            error: {
              code: 'Disposed',
              message: reply.type === 'failed' ? reply.error.message : 'The editor worker stopped.'
            }
          };
    },
    /** Reads bounded layer operands after conservative exact-compositor admission. */
    async gpuLayers(document: number, rect: PsdRegionRect, settings: PsdRenderSettings) {
      const reply = await send({ type: 'gpuLayers', document, rect, settings });
      return reply.type === 'gpuLayers' ? { ok: true as const, value: reply.source } : failure(reply);
    },
    merged,
    difference,
    detectBlending,
    layer,
    channels,
    original,
    paths,
    addFonts,
    fonts,
    documentFonts,
    textSupport,
    dispose,
    restart,
    /** Latest actual WASM capacity plus host source bytes, available without telemetry. */
    memory: () => memory
  };
}

/** The client's API, for features that take it as a dependency. */
export type PsdClient = ReturnType<typeof makePsdClient>;

/** The parts of a `Worker` the client uses, so tests can connect it to a host in-process. */
export type PsdWorkerPort = {
  postMessage(message: PsdRequest, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: PsdReply }) => void) | null;
  onerror: ((event: { message: string; preventDefault?: () => void }) => void) | null;
  onmessageerror: (() => void) | null;
};

/**
 * A document the worker opened: its id for later requests, its structure and saved states, and how the file was read.
 */
export type OpenedPsd = {
  document: number;
  info: PsdInfo & { windowed?: boolean };
  layers: PsdLayerNode[];
  states: PsdStates;
  opening: PsdOpening;
  windowed?: boolean;
  sourceBacked?: boolean;
  capability?: PsdResultOf<PsdRegionCapability>;
  sourceLayerFailure?: import('@app-game/psd/viewer').PsdFailure;
};

/** A layer's detail, and its pixels or why it has none. */
export type LayerContents = { detail: PsdLayerDetail; pixels: PsdResultOf<PsdLayerPixels> };

/** Starts the module worker that hosts the viewer module. */
export function createPsdWorker(): PsdWorkerPort {
  return new Worker(new URL('./psd.worker.ts', import.meta.url), {
    type: 'module',
    name: 'psd-viewer'
  }) as unknown as PsdWorkerPort;
}

type RenderRequest = Extract<DistributiveOmit<PsdRequest, 'id'>, { type: 'render' | 'renderWindow' }>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A failed reply as a result; any reply of the wrong type counts as invalid. */
function failure(reply: PsdReply): { ok: false; error: WorkerFailure } {
  return {
    ok: false,
    error: reply.type === 'failed' ? reply.error : { kind: 'invalid', message: `unexpected ${reply.type} reply` }
  };
}
