import { noop } from '@solid-primitives/utils';
import { onCleanup } from 'solid-js';

/**
 * we use:
 * * pointerdown - when the pointer is pressed
 * * pointermove - when the pointer is moved
 * * pointerup - when the pointer is released
 * * pointercancel - when the pointer is cancelled
 *
 * we don not use:
 * * pointerover - when the pointer enters the element
 * * pointerenter - when the pointer enters the element
 * * pointerleave - when the pointer leaves the element
 * * pointerout - when the pointer leaves the element
 */
export function usePointerDownHandler({
  onPointerDown = noop,
  onPointerMove = noop,
  onPointerUp = noop
}: {
  onPointerDown?: (e: PointerEvent) => void;
  onPointerMove?: (e: PointerEvent) => void;
  onPointerUp?: (e: PointerEvent) => void;
}) {
  let pointerId: number | null = null;
  let target: HTMLElement | null = null;

  const handlePointerDown = (e: PointerEvent) => {
    pointerId = e.pointerId;
    target = e.target as HTMLElement;
    if (!target) {
      return;
    }

    target.setPointerCapture(pointerId);
    onPointerDown(e);
    target.addEventListener('pointermove', handlePointerMove);
    target.addEventListener('pointerup', handlePointerUp);
    target.addEventListener('pointercancel', handlePointerUp);
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (pointerId !== e.pointerId || !target) {
      return;
    }
    onPointerMove(e);
  };

  const handlePointerUp = (e: PointerEvent) => {
    if (pointerId !== e.pointerId || !target) {
      return;
    }
    onPointerUp(e);

    target.releasePointerCapture(pointerId);
    pointerId = null;
    target.removeEventListener('pointermove', handlePointerMove);
    target.removeEventListener('pointerup', handlePointerUp);
    target.removeEventListener('pointercancel', handlePointerUp);
    target = null;
  };

  onCleanup(() => {
    pointerId = null;
    if (target) {
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
      target.removeEventListener('pointercancel', handlePointerUp);
      target = null;
    }
  });

  return handlePointerDown;
}
