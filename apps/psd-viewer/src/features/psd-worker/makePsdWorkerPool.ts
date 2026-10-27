import type { PsdRenderSettings } from '@app-game/psd/viewer';
import { viewerPerformance } from '../telemetry/performance';
import { makePsdClient, type OpenedPsd, type PsdClient, type PsdWorkerPort } from './makePsdClient';
import { requiresWindowedRendering } from './protocol';

/**
 * Adds an optional second immutable tile document to the ordinary client. Full renders, overviews and inspection
 * remain on the primary. Admission requires observed native window work, RGB8/Gray8, no supplied fonts, and room
 * for both workers' capacity reservations, both host sources, display budgets and miscellaneous host overhead.
 * Source bytes are read from a worker-owned Blob and transferred to the spare; no isolation headers are needed.
 * One worker is the default until the user selects two. Dispose/restart/open terminate the spare immediately.
 */
export function makePsdWorkerPool(
  primary: PsdClient,
  spawn: () => PsdWorkerPort,
  options: {
    /** Maximum count; defaults to the one-worker baseline. */
    workers?: 1 | 2;
    /** Total worker/display reservation for spare admission; defaults to 3 GiB. */
    budgetBytes?: number;
    /** Display admission, rechecked on demand, defaults to true. False keeps expensive output configurations serial. */
    parallelAllowed?: () => boolean;
  } = {}
) {
  const budgetBytes = options.budgetBytes ?? 3072 * mib;
  let workers = options.workers ?? 1;
  let opened: OpenedPsd | undefined;
  let secondary: { client: PsdClient; document: number } | undefined;
  let preparing: Promise<void> | undefined;
  let generation = 0;
  let documentEpoch = 0;
  let sourceBytes = 0;
  let metadataBytes = 0;
  let hasFonts = false;
  let disabled = false;
  let verified: string | undefined;
  let primaryBusy = 0;
  let primaryFlight: ReturnType<PsdClient['renderWindow']> | undefined;
  let secondaryBusy = false;
  let serialMillisecondsPerTile: number | undefined;
  let serialServiceMilliseconds: number | undefined;
  let parallelBatchAllowed = true;
  const batchCosts = new Map<number, { serial?: number; parallel?: number }>();
  const serialInputs: number[] = [];
  const parallelInputs: number[] = [];

  function disable(reason: string) {
    disabled = true;
    viewerPerformance.record(`workers.disabled.${reason}`, performance.now(), 1);
    stop();
  }

  function stop() {
    generation++;
    secondary?.client.dispose();
    secondary = undefined;
    secondaryBusy = false;
    preparing = undefined;
  }

  function account() {
    const main = primary.memory();
    const spare = secondary?.client.memory();
    const actual = main.wasmBytes + main.sourceBytes + (spare?.wasmBytes ?? 0) + (spare?.sourceBytes ?? 0);
    const reserved =
      displayAndHostBytes +
      (secondary || preparing ? 2 * (workerBytes + sourceBytes) : Math.max(workerBytes, main.wasmBytes) + sourceBytes);
    viewerPerformance.record('workers.actual.bytes', performance.now(), actual);
    viewerPerformance.record('workers.accounted.bytes', performance.now(), reserved);
    viewerPerformance.record('workers.budget.bytes', performance.now(), budgetBytes);
    viewerPerformance.record('workers.active', performance.now(), secondary ? 2 : 1);
    return main.wasmBytes <= workerBytes && (!spare || spare.wasmBytes <= workerBytes) && reserved <= budgetBytes;
  }

  function eligible(settings: PsdRenderSettings) {
    return (
      workers === 2 &&
      (options.parallelAllowed?.() ?? true) &&
      !disabled &&
      !hasFonts &&
      !!opened &&
      !opened.sourceBacked &&
      requiresWindowedRendering(opened.info) &&
      opened.info.depth === 8 &&
      [1, 3].includes(opened.info.mode) &&
      opened.info.layerRecords <= 4096 &&
      metadataBytes <= 8 * mib &&
      !settings.typeLayers &&
      !settings.vectorPaths &&
      !settings.smartObjects &&
      primary.memory().wasmBytes > 0 &&
      primary.memory().wasmBytes <= workerBytes &&
      2 * (workerBytes + sourceBytes) + displayAndHostBytes <= budgetBytes
    );
  }

  async function prepareWindows(
    document: number,
    settings: PsdRenderSettings,
    visibility: [number, boolean][],
    independent: number
  ): Promise<1 | 2> {
    if (
      document !== opened?.document ||
      independent < 2 ||
      !eligible(settings) ||
      verified !== key(settings, visibility)
    ) {
      if (!eligible(settings)) {
        stop();
      }
      return 1;
    }

    const cost = batchCosts.get(batchBucket(independent));
    parallelBatchAllowed = !cost?.parallel || !cost.serial || cost.parallel < cost.serial / 1.3;
    if (!parallelBatchAllowed) {
      viewerPerformance.record('workers.batch.serial', performance.now(), independent);
      return 1;
    }

    if (!secondary && !preparing) {
      const current = generation;
      // Blob storage and its temporary ArrayBuffer coexist during opening. The display/host reserve covers one
      // extra source, and admission refuses sources larger than that reserve before requesting the Blob.
      if (sourceBytes > hostSourceReserveBytes) {
        return 1;
      }
      preparing = (async () => {
        let client: PsdClient | undefined;
        try {
          const original = await primary.original(document);
          if (!original.ok || current !== generation) {
            return;
          }
          const bytes = await original.value.arrayBuffer();
          if (current !== generation) {
            return;
          }
          client = makePsdClient(spawn());
          secondary = { client, document: 0 };
          const result = await client.open(bytes, {}, 'strict');
          if (current !== generation) {
            client.dispose();
            return;
          }
          if (!result.ok || !account()) {
            disabled = true;
            stop();
            return;
          }
          secondary.document = result.value.document;
        } catch {
          client?.dispose();
          if (current === generation) {
            disabled = true;
            stop();
          }
        }
      })().finally(() => {
        if (current === generation) {
          preparing = undefined;
        }
      });
    }
    await preparing;
    return secondary?.document && account() ? 2 : 1;
  }

  // A spare can disappear while two scheduler lanes are active. Serialize their serial retries outside the
  // primary client's coalescing queue so neither lane supersedes the other's still-needed tile.
  const renderPrimary: PsdClient['renderWindow'] = async (...args) => {
    while (primaryFlight) {
      await primaryFlight.catch(() => undefined);
    }

    if (args[4].aborted) {
      return canceledWindow();
    }
    const job = primary.renderWindow(args[0], args[1], args[2], args[3], new AbortController().signal, args[5]);
    primaryFlight = job;

    try {
      return await job;
    } finally {
      if (primaryFlight === job) {
        primaryFlight = undefined;
      }
    }
  };

  const renderWindow: PsdClient['renderWindow'] = async (document, settings, visibility, window, signal) => {
    if (signal.aborted) {
      return canceledWindow();
    }
    // Ordinary posted cancellation cannot interrupt synchronous WASM. Retain its slot and byte reservation until
    // the native reply actually arrives; the outer camera interest still cancels immediately.
    const nativeSignal = new AbortController().signal;
    const identity = key(settings, visibility);
    const parallel =
      parallelBatchAllowed &&
      window.kind === 'regions' &&
      verified === identity &&
      eligible(settings) &&
      !!secondary?.document;
    if (window.kind !== 'saved' && verified !== identity) {
      verified = undefined;
    }
    const spare = parallel && primaryBusy > 0 && !secondaryBusy ? secondary : undefined;
    if (spare) {
      secondaryBusy = true;
    } else {
      primaryBusy++;
    }
    const session = documentEpoch;
    try {
      let result = await (spare ? spare.client.renderWindow : renderPrimary)(
        spare?.document ?? document,
        settings,
        visibility,
        window,
        spare ? nativeSignal : signal,
        parallel ? workerBytes : undefined
      );
      if (session !== documentEpoch) {
        return { ok: false, error: { kind: 'superseded', message: 'Worker session replaced' } };
      }
      if (
        !account() ||
        (parallel && (!result.ok || result.value.images.some((image) => image.strategy !== 'window')))
      ) {
        disabled = true;
        stop();
        // A bounded-operation refusal is retried serially under the original one-worker policy.
        if (!result.ok && !signal.aborted) {
          result = await renderPrimary(document, settings, visibility, window, signal);
        }
      }
      if (result.ok && window.kind === 'regions' && result.value.images.some((image) => image.populated)) {
        const service = result.value.milliseconds / result.value.images.length;
        if (!parallel) {
          serialServiceMilliseconds =
            serialServiceMilliseconds === undefined ? service : Math.min(serialServiceMilliseconds * 1.1, service);
        } else if (serialServiceMilliseconds !== undefined && service > serialServiceMilliseconds * 1.8) {
          // Contention is visible before a batch finishes. Its remaining jobs use the primary; the next batch
          // gets a fresh prediction rather than losing useful parallelism for the entire document.
          parallelBatchAllowed = false;
          viewerPerformance.record('workers.batch.contention', performance.now(), service / serialServiceMilliseconds);
        }
      }
      if (signal.aborted) {
        return canceledWindow();
      }
      if (result.ok && window.kind !== 'saved' && result.value.images.every((image) => image.strategy === 'window')) {
        verified = identity;
      } else if (result.ok && result.value.images.some((image) => image.strategy === 'fullCanvas')) {
        verified = undefined;
        stop();
      }
      return result;
    } catch (error) {
      if (session !== documentEpoch) {
        return { ok: false, error: { kind: 'superseded', message: 'Worker session replaced' } };
      }
      if (!spare) {
        if (signal.aborted) {
          return canceledWindow();
        }
        throw error;
      }
      disable('worker');
      if (signal.aborted) {
        return canceledWindow();
      }
      return renderPrimary(document, settings, visibility, window, signal);
    } finally {
      if (spare) {
        if (secondary === spare) {
          secondaryBusy = false;
        }
      } else {
        primaryBusy--;
      }
    }
  };

  return {
    ...primary,
    async open(...args: Parameters<PsdClient['open']>) {
      documentEpoch++;
      stop();
      opened = undefined;
      verified = undefined;
      disabled = false;
      serialMillisecondsPerTile = undefined;
      serialServiceMilliseconds = undefined;
      parallelBatchAllowed = true;
      batchCosts.clear();
      serialInputs.length = 0;
      parallelInputs.length = 0;
      sourceBytes = args[0] instanceof Blob ? args[0].size : args[0].byteLength;
      const current = documentEpoch;
      const result = await primary.open(...args);
      if (current === documentEpoch && result.ok) {
        opened = result.value;
        // Reserve eight times the UTF-16 JSON payload for both object trees and transient open replies.
        // A metadata-heavy document stays serial rather than multiplying an unbounded JS snapshot.
        try {
          metadataBytes =
            JSON.stringify(opened, (_, value) => (typeof value === 'bigint' ? value.toString() : value)).length * 2;
        } catch {
          metadataBytes = Infinity;
        }
      }
      account();
      return result;
    },
    renderWindow,
    prepareWindows,
    /** A spare holds original bytes, so any edit attempt retires it until a new document opens. */
    async editor(...args: Parameters<PsdClient['editor']>) {
      if (['edit', 'undo', 'redo'].includes(args[1].kind)) {
        disable('editing');
      }
      return primary.editor(...args);
    },
    /** Records cold batch cost by size. Slow batches run serially next time; empty/cache-only batches abstain. */
    reportWindowBatch(batch: {
      workers: number;
      tiles: number;
      populated: number;
      milliseconds: number;
      requestMilliseconds: number;
    }) {
      if (batch.populated < 1 || batch.milliseconds <= 0) {
        return;
      }
      const bucket = batchBucket(batch.tiles);
      const cost = batchCosts.get(bucket) ?? {};
      const perTile = batch.milliseconds / batch.tiles;
      if (batch.workers === 1) {
        serialMillisecondsPerTile = perTile;
        cost.serial = perTile;
        batchCosts.set(bucket, cost);
        return;
      }
      cost.parallel = perTile;
      cost.serial ??= serialServiceMilliseconds ?? serialMillisecondsPerTile ?? batch.requestMilliseconds / batch.tiles;
      serialServiceMilliseconds ??= cost.serial;
      batchCosts.set(bucket, cost);
      const serial = cost.serial * batch.tiles;
      const speedup = serial / batch.milliseconds;
      viewerPerformance.record('workers.batch.speedup', performance.now(), speedup);
      if (speedup < 1.3) {
        parallelBatchAllowed = false;
        viewerPerformance.record('workers.batch.serial', performance.now(), batch.tiles);
      }
    },
    /** Bounded input samples work without telemetry. Compare p95 with a measured serial baseline, or the 33 ms gate. */
    reportInteraction(milliseconds: number) {
      const samples = secondary ? parallelInputs : serialInputs;
      samples.push(milliseconds);
      if (samples.length > 128) {
        samples.shift();
      }
      if (secondary && parallelInputs.length >= 32) {
        const baseline = serialInputs.length >= 32 ? p95(serialInputs) : 33;
        if (p95(parallelInputs) > Math.min(33, baseline)) {
          disable('interaction');
        }
      }
    },
    /** Selects the maximum worker count. Admission may still keep the document serial. */
    setWorkers(value: 1 | 2) {
      workers = value;
      if (value === 1) {
        stop();
      }
    },
    async addFonts(...args: Parameters<PsdClient['addFonts']>) {
      hasFonts = true;
      stop();
      return primary.addFonts(...args);
    },
    restart() {
      documentEpoch++;
      stop();
      opened = undefined;
      verified = undefined;
      primary.restart();
    },
    dispose() {
      documentEpoch++;
      stop();
      primary.dispose();
    }
  };
}

/** Similar cold batch sizes share predictions without applying a sparse batch's cost to larger dense work. */
function batchBucket(tiles: number) {
  return Math.ceil(Math.log2(Math.max(1, tiles)));
}

/** A tile consumer can prepare admitted concurrency; protocol-only clients remain serial. */
export type WindowClient = Pick<PsdClient, 'renderWindow'> &
  Partial<Pick<PsdClient, 'gpuLayers'>> &
  Partial<Pick<ReturnType<typeof makePsdWorkerPool>, 'prepareWindows' | 'reportWindowBatch'>>;

function key(settings: PsdRenderSettings, visibility: [number, boolean][]) {
  return JSON.stringify([settings, [...new Map(visibility)].sort(([a], [b]) => a - b)]);
}

function canceledWindow() {
  return { ok: false as const, error: { kind: 'superseded' as const, message: 'Window interest canceled' } };
}

function p95(samples: number[]) {
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
}

const mib = 1024 * 1024;
// The existing backend conservatively charges about 880 MiB for one bordered PSB tile, despite a 179 MiB heap.
const workerBytes = 1024 * mib;
const hostSourceReserveBytes = 128 * mib;
// CPU tiles 64 MiB, GPU tiles 128 MiB, one transient source 128 MiB, other host metadata 64 MiB.
const displayAndHostBytes = 384 * mib;
