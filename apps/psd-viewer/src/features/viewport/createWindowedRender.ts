import type { PsdRenderSettings } from '@app-game/psd/viewer';
import { createEventListener } from '@solid-primitives/event-listener';
import { createRAF } from '@solid-primitives/raf';
import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdResultOf, RenderedPixels } from '../psd-worker';
import type { WindowClient } from '../psd-worker/makePsdWorkerPool';
import { requiresWindowedRendering } from '../psd-worker/protocol';
import type { createViewport } from './createViewport';
import { makeWindowRenderer } from './makeWindowRenderer';

/**
 * Binds the worker tile cache to rendering inputs and the viewport. Each camera update cancels previous interest;
 * current-content worker completions enter the shared LRU, while only current demand can publish a frame.
 * Pan/zoom remains synchronous while fresh pixels arrive independently.
 * The temporary saved first frame is cleared on failure, edits or cancellation. Disposal releases cached pixels.
 */
export function createWindowedRender(
  client: WindowClient,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  settings: Accessor<PsdRenderSettings>,
  visibility: Accessor<[number, boolean][]>,
  viewport: Pick<ReturnType<typeof createViewport>, 'view' | 'size'>
) {
  const renderer = makeWindowRenderer(client);
  const [dpr, setDpr] = createSignal(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  createEventListener(
    () => (typeof window === 'undefined' ? undefined : window),
    'resize',
    () => setDpr(devicePixelRatio)
  );
  onCleanup(renderer.clear);
  const [render, setRender] = createSignal<PsdResultOf<RenderedPixels>>();
  const [busy, setBusy] = createSignal(false);
  const snapshot = createMemo(() => {
    const document = opened();
    return document?.ok && requiresWindowedRendering(document.value.info)
      ? { opened: document.value, settings: settings(), visibility: visibility() }
      : undefined;
  });
  let previous: ReturnType<typeof snapshot>;
  let renderFrame: (() => void) | undefined;
  // Camera drawing registers its RAF in input capture. Plan new worker demand after that submission.
  const [, startPlanning, stopPlanning] = createRAF(() => {
    stopPlanning();
    renderFrame?.();
  });
  createEffect(
    () => ({ snapshot: snapshot(), view: viewport.view(), size: viewport.size(), dpr: dpr() }),
    ({ snapshot, view, size, dpr }) => {
      if (previous !== snapshot) {
        setRender(undefined);
        previous = snapshot;
      }

      if (!snapshot) {
        renderer.clear();
        setBusy(false);
        return;
      }

      const controller = new AbortController();
      setBusy(true);
      renderFrame = () => {
        void renderer
          .render(snapshot, view, { ...size, dpr }, controller.signal, (image) => setRender({ ok: true, value: image }))
          .then(
            (result) => {
              if (!controller.signal.aborted) {
                // An off-document camera has no demand. Keep valid tiles and the GPU scope for a warm return.
                if (result) {
                  setRender(result);
                }

                setBusy(false);
              }
            },
            (error) => {
              if (!controller.signal.aborted) {
                setRender({ ok: false, error: { kind: 'invalid', message: String(error) } });
                setBusy(false);
              }
            }
          );
      };
      startPlanning();
      return () => {
        stopPlanning();
        controller.abort();
        // Saved pixels must never survive an interrupted replacement.
        setRender((current) =>
          current?.ok && current.value.window?.source === 'savedComposite' ? undefined : current
        );
      };
    }
  );

  return { render, busy };
}
