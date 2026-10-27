import type { PsdOpenAnswers, PsdRenderSettings } from '@app-game/psd/viewer';
import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import { makeCompositePreviews, type CompositeDiagnostics } from '../gpu-composite/makeCompositePreviews';
import type { DisplayImage } from '../gpu-viewport/displayTiles';
import type { OpenedPsd, PsdClient, PsdResultOf, RenderedPixels } from '../psd-worker';
import { requiresWindowedRendering } from '../psd-worker/protocol';
import { viewerPerformance } from '../telemetry/performance';

/**
 * A file to open: its name for display, how to read its bytes, rendering settings it was captured with, and the
 * answers to Photoshop's prompts it is opened with.
 */
export type PsdSource = {
  name: string;
  read: () => Promise<ArrayBuffer | Blob>;
  /** Settings to apply with the document, such as the Color Settings an example was saved under. */
  settings?: PsdRenderSettings;
  /** Answers to the prompts Photoshop shows while opening the file; none until a prompt was shown. */
  answers?: PsdOpenAnswers;
  /** Strict skips recovery; source uses only host-backed saved pixels and original channel windows. */
  mode?: 'strict' | 'source';
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
 * The accessor always returns strict CPU pixels. Optional bounded GPU previews are exposed separately and must
 * only be used for the layer display, never comparisons or exports. Disposal invalidates late previews.
 */
export function createPsdRender(
  client: Pick<PsdClient, 'render' | 'renderWindow' | 'gpuLayers'>,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  settings: Accessor<PsdRenderSettings>,
  visibility: Accessor<[number, boolean][]>,
  gpuComposite: Accessor<boolean> = () => false,
  fontRevision: Accessor<number> = () => 0
) {
  const request = createMemo(() => {
    const document = opened();
    if (!document?.ok || requiresWindowedRendering(document.value.info)) {
      return undefined;
    }

    const snapshot = {
      opened: document.value,
      settings: settings(),
      visibility: visibility(),
      revision: fontRevision()
    };
    return { snapshot, result: client.render(document.value.document, snapshot.settings, snapshot.visibility) };
  });
  // Strict completion must not hold GPU preview updates in the same async reactive transaction.
  const [render, setRender] = createSignal<PsdResultOf<RenderedPixels>>();
  const [pending, setPending] = createSignal(false);
  let previousDocument: OpenedPsd['layers'] | undefined;
  createEffect(
    () => request(),
    (request) => {
      if (previousDocument !== request?.snapshot.opened.layers) {
        setRender(undefined);
        previousDocument = request?.snapshot.opened.layers;
      }
      setPending(!!request);
      if (!request) {
        return;
      }

      let active = true;
      void request.result.then(
        (result) => {
          if (active) {
            setRender(result);
            setPending(false);
          }
        },
        (error) => {
          if (active) {
            setRender({ ok: false, error: { kind: 'invalid', message: String(error) } });
            setPending(false);
          }
        }
      );
      return () => {
        active = false;
      };
    }
  );
  const [preview, setPreview] = createSignal<DisplayImage>();
  const [diagnostics, setDiagnostics] = createSignal<CompositeDiagnostics>();
  const compositor = makeCompositePreviews(client, (state) => {
    setDiagnostics(state);
    if (state.state === 'verified' || state.state === 'disabled') {
      setPreview(undefined);
    }
  });
  onCleanup(compositor.clear);
  createEffect(
    () => ({ request: request(), enabled: gpuComposite() }),
    ({ request, enabled }) => {
      setPreview(undefined);
      if (!request || !enabled) {
        compositor.clear();
        return;
      }

      const { snapshot, result } = request;
      const { width, height } = snapshot.opened.info;
      // One whole display texture and its readback must fit the existing 2 MiB verification allowance.
      // Larger whole renders retain their ordinary CPU path, without changing document admission.
      if (width * height * 4 > 2 * 1024 * 1024) {
        compositor.clear();
        return;
      }

      let active = true;
      const controller = new AbortController();
      const rect = { left: 0, top: 0, width, height };
      void compositor
        .prepare(snapshot, rect, rect, () => {
          if (active) {
            setPreview(undefined);
          }
        })
        .then(async (candidate) => {
          if (!active || !candidate) {
            return;
          }

          setPreview({ width, height, pixels: new Uint8Array(0), tiles: [candidate.tile] });
          // Submit the interactive frame before queuing the independent bounded CPU verification.
          // This uses the same region contract as tiled compositing, without changing the whole render
          // identity used by comparisons and exports. A missing backend cannot strand verification.
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 50);
            void candidate.submitted.then(() => {
              clearTimeout(timeout);
              resolve();
            });
          });
          if (!active) {
            return;
          }

          // Both operations share a coalescing worker queue. Verification must not replace the
          // authoritative render while it is still queued behind older work.
          const strict = await result;
          if (!active) {
            return;
          }
          if (!strict.ok) {
            candidate.tile.gpu?.onFailure('Strict whole render refused.');
            return;
          }

          const verification = await client.renderWindow(
            snapshot.opened.document,
            snapshot.settings,
            snapshot.visibility,
            {
              kind: 'regions',
              rectangles: [rect]
            },
            controller.signal
          );
          if (active && verification.ok) {
            candidate.strict(verification.value.images[0]);
          } else if (active) {
            candidate.tile.gpu?.onFailure('Strict whole-render verification refused.');
            setPreview(undefined);
          }
        })
        .catch(() => {
          if (active) {
            setPreview(undefined);
          }
        });
      return () => {
        active = false;
        controller.abort();
      };
    }
  );

  return Object.assign(render, { preview, diagnostics, pending });
}

/** Reads the source and opens it; a source that cannot be read fails like an unreadable file. */
async function readAndOpen(
  client: Pick<PsdClient, 'open'>,
  source: PsdSource,
  signal: AbortSignal
): Promise<PsdResultOf<OpenedPsd>> {
  const reading = performance.now();
  let bytes: ArrayBuffer | Blob;
  try {
    bytes = await source.read();
    viewerPerformance.record('source.read', reading, bytes instanceof Blob ? bytes.size : bytes.byteLength);
  } catch (error) {
    return { ok: false, error: { kind: 'invalid', message: `${source.name} could not be read: ${String(error)}` } };
  }

  if (signal.aborted) {
    return { ok: false, error: { kind: 'superseded', message: 'Document operation canceled' } };
  }

  return client.open(bytes, source.answers, source.mode);
}
