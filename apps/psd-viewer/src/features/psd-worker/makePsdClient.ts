import type {
  PsdDifference,
  PsdDocumentFonts,
  PsdFontInfo,
  PsdImage,
  PsdInfo,
  PsdLayerDetail,
  PsdLayerNode,
  PsdLayerPixels,
  PsdRenderSettings,
  PsdTextSupport
} from '@app-game/psd/viewer';
import type { PsdReply, PsdRequest, PsdResultOf, RenderedPixels, WorkerFailure } from './protocol';

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
  let queued:
    | { request: RenderRequest; settle: (result: PsdResultOf<RenderedPixels>) => void; reject: (error: Error) => void }
    | undefined;

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

  /** Opens `bytes`, which are transferred to the worker; the worker closes the document it held before. */
  async function open(bytes: ArrayBuffer): Promise<PsdResultOf<OpenedPsd>> {
    const reply = await send({ type: 'open', bytes }, [bytes]);
    return reply.type === 'opened'
      ? { ok: true, value: { document: reply.document, info: reply.info, layers: reply.layers } }
      : failure(reply);
  }

  /** Renders the open document `document` with `settings` and visibility overrides. */
  function render(
    document: number,
    settings: PsdRenderSettings,
    visibility: [number, boolean][]
  ): Promise<PsdResultOf<RenderedPixels>> {
    return new Promise((settle, reject) => {
      queued?.settle({ ok: false, error: { kind: 'superseded', message: 'a newer render replaced this one' } });
      queued = { request: { type: 'render', document, settings: { ...settings }, visibility }, settle, reject };
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

  /** One layer's detail and, where it has any, its own pixels. */
  async function layer(document: number, index: number): Promise<PsdResultOf<LayerContents>> {
    const reply = await send({ type: 'layer', document, index });
    return reply.type === 'layer'
      ? { ok: true, value: { detail: reply.detail, pixels: reply.pixels } }
      : failure(reply);
  }

  /**
   * Adds font files to the worker's font library, transferring their buffers; resolves with each file's font or why
   * it was refused, in order, and the library after adding.
   */
  async function addFonts(
    fonts: ArrayBuffer[]
  ): Promise<PsdResultOf<{ results: PsdResultOf<PsdFontInfo>[]; fonts: PsdFontInfo[] }>> {
    const reply = await send({ type: 'addFonts', fonts }, fonts);
    return reply.type === 'fontsAdded'
      ? { ok: true, value: { results: reply.results, fonts: reply.fonts } }
      : failure(reply);
  }

  /** The fonts in the worker's font library, sorted by PostScript name. */
  async function fonts(): Promise<PsdResultOf<PsdFontInfo[]>> {
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
      .then(
        (reply) => job.settle(reply.type === 'rendered' ? { ok: true, value: reply.render } : failure(reply)),
        job.reject
      )
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

  return { open, render, merged, difference, layer, addFonts, fonts, documentFonts, textSupport, dispose };
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

/** A document the worker opened: its id for later requests, and its structure. */
export type OpenedPsd = { document: number; info: PsdInfo; layers: PsdLayerNode[] };

/** A layer's detail, and its pixels or why it has none. */
export type LayerContents = { detail: PsdLayerDetail; pixels: PsdResultOf<PsdLayerPixels> };

/** Starts the module worker that hosts the viewer module. */
export function createPsdWorker(): PsdWorkerPort {
  return new Worker(new URL('./psd.worker.ts', import.meta.url), {
    type: 'module',
    name: 'psd-viewer'
  }) as unknown as PsdWorkerPort;
}

type RenderRequest = Extract<DistributiveOmit<PsdRequest, 'id'>, { type: 'render' }>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A failed reply as a result; any reply of the wrong type counts as invalid. */
function failure(reply: PsdReply): { ok: false; error: WorkerFailure } {
  return {
    ok: false,
    error: reply.type === 'failed' ? reply.error : { kind: 'invalid', message: `unexpected ${reply.type} reply` }
  };
}
