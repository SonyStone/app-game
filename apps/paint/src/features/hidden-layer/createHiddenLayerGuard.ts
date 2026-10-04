import { makeTimer } from '@solid-primitives/timer';
import { createMemo, createSignal, onCleanup } from 'solid-js';

/**
 * Refuses brush and eraser contacts while the active layer is hidden, which the drawing engine would ignore without a
 * word, and says why instead: `notice` names the layer until it is shown, dismissed, or {@link noticeMs} pass. Pen and
 * mouse contacts only; touch keeps navigating and Alt/Option is left to color picking. Must be created within a Solid
 * owner.
 */
export function createHiddenLayerGuard(options: {
  /** Whether the active tool paints with strokes: the brush or the eraser. */
  paints: () => boolean;
  /** The active layer, if any. */
  layer: () => { id: string; name: string; visible: boolean } | undefined;
}) {
  const [refused, setRefused] = createSignal<string>();
  let clearTimer: (() => void) | undefined;
  onCleanup(() => clearTimer?.());
  /** The hidden layer a contact was refused on, while it is still the active layer and hidden. */
  const notice = createMemo(() => {
    const layer = options.layer();
    return layer && !layer.visible && layer.id === refused() ? { id: layer.id, name: layer.name } : undefined;
  });

  return {
    notice,
    /** Hides the notice. */
    dismiss() {
      clearTimer?.();
      setRefused(undefined);
    },
    canvasAction: {
      enabled: (event: Pick<PointerEvent, 'altKey' | 'pointerType'>) =>
        options.paints() && !event.altKey && event.pointerType !== 'touch' && options.layer()?.visible === false,
      run() {
        clearTimer?.();
        setRefused(options.layer()?.id);
        clearTimer = makeTimer(() => setRefused(undefined), noticeMs, setTimeout);
      }
    }
  };
}

/** How long the notice stays after the last refused contact, in milliseconds. */
export const noticeMs = 5000;
