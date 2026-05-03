import { Vec2 } from '@app-game/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';
import { onCleanup } from 'solid-js';

/**
 * Transform Origin (Pivot) Handlers
 */
export function useTransformOriginHandler({
  origin = Vec2.create(0, 0),
  setOrigin = noop
}: {
  origin?: MaybeAccessor<Vec2>;
  setOrigin?: (value: Vec2) => void;
  updateTransform?: () => void;
} = {}) {
  const originStartPointer = Vec2.create(0, 0);
  const startOrigin = Vec2.create(0, 0);

  const client = Vec2.create(0, 0);
  const d = Vec2.create(0, 0);

  const handlePointerDown = (e: PointerEvent) => {
    window.getSelection()?.removeAllRanges();
    // Prevent event bubbling to parent handlers.
    e.stopPropagation();
    originStartPointer.set(e.clientX, e.clientY);
    startOrigin.copy(access(origin));
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerMove = (e: PointerEvent) => {
    setOrigin(startOrigin.add(d.subFrom(client.set(e.clientX, e.clientY), originStartPointer)));
  };

  const handlePointerUp = () => {
    originStartPointer.set(0, 0);
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  onCleanup(() => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  });

  return {
    handleOriginPointerDown: handlePointerDown
  };
}
