import type { PsdRenderSettings } from '@app-game/psd/viewer';
import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdClient, PsdResultOf, RenderedPixels } from '../psd-worker';
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
  client: Pick<PsdClient, 'renderWindow'>,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  settings: Accessor<PsdRenderSettings>,
  visibility: Accessor<[number, boolean][]>,
  viewport: Pick<ReturnType<typeof createViewport>, 'view' | 'size'>
) {
  const renderer = makeWindowRenderer(client);
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
  createEffect(
    () => ({ snapshot: snapshot(), view: viewport.view(), size: viewport.size() }),
    ({ snapshot, view, size }) => {
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
      void renderer
        .render(snapshot, view, size, controller.signal, (image) => setRender({ ok: true, value: image }))
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
      return () => {
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
