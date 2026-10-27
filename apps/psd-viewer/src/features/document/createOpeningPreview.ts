import type { PsdImage, PsdRenderSettings } from '@app-game/psd/viewer';
import { createEffect, createSignal, type Accessor } from 'solid-js';
import type { OpenedPsd, PsdClient, PsdResultOf } from '../psd-worker';
import { requiresWindowedRendering } from '../psd-worker/protocol';

/** Presents saved pixels, or chosen settings without a saved composite, before admitting background detection. */
export function createOpeningPreview(
  client: PsdClient,
  opened: Accessor<PsdResultOf<OpenedPsd> | undefined>,
  settings: Accessor<PsdRenderSettings>
) {
  const [preview, setPreview] = createSignal<{ image: PsdImage; source: 'saved' | 'chosen' }>();
  const [ready, setReady] = createSignal(false);
  let acknowledge: ((image: PsdImage) => void) | undefined;
  createEffect(
    () => opened(),
    (document) => {
      setPreview(undefined);
      setReady(false);
      acknowledge = undefined;
      if (!document?.ok) {
        return;
      }

      if (
        document.value.sourceBacked ||
        requiresWindowedRendering({ width: document.value.info.width, height: document.value.info.height })
      ) {
        setReady(true);
        return;
      }

      let active = true;
      let frame = 0;
      const source = document.value.info.mergedImage ? 'saved' : 'chosen';
      const result =
        source === 'saved'
          ? client.merged(document.value.document)
          : client.render(document.value.document, settings(), []);
      void result.then(
        (value) => {
          if (!active) {
            return;
          }

          if (value.ok) {
            setPreview({ image: value.value, source });
          }

          if (!value.ok) {
            setReady(true);
            return;
          }

          // Device initialization and chunked uploads can outlast two RAFs. The display acknowledges real pixels.
          acknowledge = (image) => {
            if (image !== value.value || frame) {
              return;
            }

            frame = requestAnimationFrame(() => {
              frame = requestAnimationFrame(() => {
                if (active) {
                  setReady(true);
                }
              });
            });
          };
        },
        () => {
          if (active) {
            setReady(true);
          }
        }
      );
      return () => {
        active = false;
        cancelAnimationFrame(frame);
      };
    }
  );

  return { preview, ready, presented: (image: PsdImage) => acknowledge?.(image) };
}
