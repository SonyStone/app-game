import type { PsdOpenAnswers, PsdRenderSettings } from '@app-game/psd/viewer';
import { createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdClient, PsdResultOf } from '../psd-worker';
import { requiresWindowedRendering } from '../psd-worker/protocol';
import { viewerPerformance } from '../telemetry/performance';

/**
 * A file to open: its name for display, how to read its bytes, rendering settings it was captured with, and the
 * answers to Photoshop's prompts it is opened with.
 */
export type PsdSource = {
  name: string;
  read: () => Promise<ArrayBuffer>;
  /** Settings to apply with the document, such as the Color Settings an example was saved under. */
  settings?: PsdRenderSettings;
  /** Answers to the prompts Photoshop shows while opening the file; none until a prompt was shown. */
  answers?: PsdOpenAnswers;
  /** Strict reading skips Photoshop recovery and repair; saved pixels may still be available. */
  mode?: 'strict';
};

/** Owns opening, cancellation and retry. Late reads/replies never republish an abandoned document. */
export function createPsdDocument(client: Pick<PsdClient, 'open' | 'restart'>) {
  const [source, setSource] = createSignal<PsdSource>();
  const [opened, setOpened] = createSignal<PsdResultOf<OpenedPsd>>();
  const [opening, setOpening] = createSignal(false);
  const [canceled, setCanceled] = createSignal(false);
  let controller = new AbortController();
  let previous: PsdSource | undefined;
  let usedWorker = false;
  onCleanup(() => controller.abort());

  /** Starts a new independent worker session, preserving supplied fonts. */
  function open(next: PsdSource) {
    controller.abort();
    if (usedWorker) {
      client.restart();
    }

    usedWorker = true;
    controller = new AbortController();
    const signal = controller.signal;
    previous = { ...next };
    setSource(previous);
    setOpened(undefined);
    setCanceled(false);
    setOpening(true);
    void readAndOpen(client, previous, signal).then(
      (result) => {
        if (!signal.aborted) {
          setOpened(result);
          setOpening(false);
        }
      },
      (error) => {
        if (!signal.aborted) {
          setOpened({ ok: false, error: { kind: 'invalid', message: String(error) } });
          setOpening(false);
        }
      }
    );
  }

  /** Cancels immediately; synchronous work in the old worker cannot delay a restart. */
  function cancel() {
    controller.abort();
    client.restart();
    usedWorker = false;
    setSource(undefined);
    setOpened(undefined);
    setOpening(false);
    setCanceled(true);
  }

  /** Retries the last source, optionally with the strict reader and no Photoshop recovery. */
  function retry(mode?: 'strict') {
    if (previous) {
      open({ ...previous, mode });
    }
  }

  return { source, opened, opening, canceled, open, cancel, retry };
}

/**
 * Renders the open document whenever it, the settings or the visibility overrides change. The worker coalesces
 * renders, so only the newest of quick successive changes is composited after the one running.
 */
export function createPsdRender(
  client: PsdClient,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  settings: Accessor<PsdRenderSettings>,
  visibility: Accessor<[number, boolean][]>
) {
  return createMemo(() => {
    const document = opened();
    if (!document?.ok || requiresWindowedRendering(document.value.info)) {
      return undefined;
    }

    return client.render(document.value.document, settings(), visibility());
  });
}

/** Reads the source and opens it; a source that cannot be read fails like an unreadable file. */
async function readAndOpen(
  client: Pick<PsdClient, 'open'>,
  source: PsdSource,
  signal: AbortSignal
): Promise<PsdResultOf<OpenedPsd>> {
  const reading = performance.now();
  let bytes: ArrayBuffer;
  try {
    bytes = await source.read();
    viewerPerformance.record('source.read', reading, bytes.byteLength);
  } catch (error) {
    return { ok: false, error: { kind: 'invalid', message: `${source.name} could not be read: ${String(error)}` } };
  }

  if (signal.aborted) {
    return { ok: false, error: { kind: 'superseded', message: 'Document operation canceled' } };
  }

  return client.open(bytes, source.answers, source.mode);
}
