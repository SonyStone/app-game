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
  PsdRegionPixels,
  PsdRenderSettings,
  PsdStates,
  PsdTextSupport
} from '@app-game/psd/viewer';
import type { SessionFont } from '../fonts/addFontFile';
import type {
  BlendingDetection,
  PsdReply,
  PsdRequest,
  PsdResultOf,
  RenderedPixels,
  WindowRequest,
  WorkerFailure
} from './protocol';

/**
 * Talks to a PSD worker: each call posts one request and resolves with its reply as a typed result. Renders are
 * coalesced: one runs at a time, and a render requested while another runs waits as the only queued render, replacing
 * (and resolving as `superseded`) any render queued before it, so quick visibility toggles never pile up work. Other
 * requests go straight to the worker, which answers in arrival order. A crashed worker rejects every pending and later
 * call. `dispose` terminates the worker; pending calls then never settle.
 */
export function makePsdClient(worker: PsdWorkerPort) {
  const pending = new Map<number, { resolve: (reply: PsdReply) => void; reject: (error: Error) => void }>();
  let nextId = 0;
  let crash: Error | undefined;
  let rendering = false;
  let queued: { request: RenderRequest; settle: (reply: PsdReply) => void; reject: (error: Error) => void } | undefined;

  worker.onmessage = (event) => {
    const entry = pending.get(event.data.id);
    if (entry) {
      pending.delete(event.data.id);
      entry.resolve(event.data);
    }
  };
  worker.onerror = (event) => {
    event.preventDefault?.();
    fail(new Error(event.message || 'The PSD worker stopped'));
  };
  worker.onmessageerror = () => fail(new Error('A PSD worker message could not be read'));

  /**
   * Opens `bytes` as Photoshop does, with `answers` to its prompts; the bytes are transferred to the worker, which
   * closes the document it held before. A prompt Photoshop shows that `answers` leaves unanswered fails as
   * `needsAnswer` with the prompt: open again with its answer.
   */
  async function open(bytes: ArrayBuffer, answers: PsdOpenAnswers = {}): Promise<PsdResultOf<OpenedPsd>> {
    const reply = await send({ type: 'open', bytes, answers }, [bytes]);
    return reply.type === 'opened'
      ? {
          ok: true,
          value: {
            document: reply.document,
            info: reply.info,
            layers: reply.layers,
            states: reply.states,
            opening: reply.opening
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
    signal: AbortSignal
  ): Promise<PsdResultOf<{ images: PsdRegionPixels[]; milliseconds: number }>> {
    const reply = await scheduleRender(
      { type: 'renderWindow', document, settings: { ...settings }, visibility, window },
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

  /** One layer's detail and, where it has any, its own pixels. */
  async function layer(document: number, index: number): Promise<PsdResultOf<LayerContents>> {
    const reply = await send({ type: 'layer', document, index });
    return reply.type === 'layer'
      ? { ok: true, value: { detail: reply.detail, pixels: reply.pixels } }
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
    const reply = await send({ type: 'addFonts', fonts, sources }, fonts);
    return reply.type === 'fontsAdded'
      ? { ok: true, value: { results: reply.results, fonts: reply.fonts } }
      : failure(reply);
  }

  /** The fonts in the worker's font library, sorted by PostScript name. */
  async function fonts(): Promise<PsdResultOf<SessionFont[]>> {
    const reply = await send({ type: 'listFonts' });
    return reply.type === 'fonts' ? { ok: true, value: reply.fonts } : failure(reply);
  }

  /** The fonts the document's type layers use, and which of them the worker's library holds. */
  async function documentFonts(document: number): Promise<PsdResultOf<PsdDocumentFonts>> {
    const reply = await send({ type: 'documentFonts', document });
    return reply.type === 'documentFonts' ? { ok: true, value: reply.report } : failure(reply);
  }

  /**
   * Whether type layer record `index` re-renders from its text with the worker's library; `null` for other records.
   * The worker re-renders the layer once to decide.
   */
  async function textSupport(document: number, index: number): Promise<PsdResultOf<PsdTextSupport | null>> {
    const reply = await send({ type: 'textSupport', document, index });
    return reply.type === 'textSupport' ? { ok: true, value: reply.support } : failure(reply);
  }

  function dispose() {
    worker.terminate();
    pending.clear();
    queued = undefined;
  }

  function startRender() {
    if (rendering || !queued) {
      return;
    }

    const job = queued;
    queued = undefined;
    rendering = true;
    send(job.request)
      .then(job.settle, job.reject)
      .finally(() => {
        rendering = false;
        startRender();
      });
  }

  function send(request: DistributiveOmit<PsdRequest, 'id'>, transfer: Transferable[] = []): Promise<PsdReply> {
    if (crash) {
      return Promise.reject(crash);
    }

    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...request, id } as PsdRequest, transfer);
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
    render,
    renderWindow,
    merged,
    difference,
    detectBlending,
    layer,
    addFonts,
    fonts,
    documentFonts,
    textSupport,
    dispose
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
  info: PsdInfo;
  layers: PsdLayerNode[];
  states: PsdStates;
  opening: PsdOpening;
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
