import { Vec2 } from '@packages/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';
import { usePointerDownHandler } from './use-pointer-down-handler';

export function useScaleHandler({
  ref = undefined,
  scale = Vec2.create(1, 1),
  setScale = noop
}: {
  ref?: MaybeAccessor<HTMLDivElement | undefined>;
  scale?: MaybeAccessor<Vec2>;
  setScale?: (value: Vec2) => void;
} = {}) {
  const scaleCenter = Vec2.create(0, 0);
  let initialScaleDistance = 0;
  let initialUniformScale = 1;

  return {
    handleScalePointerDown: usePointerDownHandler({
      onPointerDown: (e: PointerEvent) => {
        window.getSelection()?.removeAllRanges();
        const _ref = access(ref);
        if (!_ref) return;
        const rect = _ref.getBoundingClientRect();
        // scaleCenter = { x: rect.left + origin()[0], y: rect.top + origin()[1] };
        scaleCenter.set(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);
        // debugLayer.push(rect.left, rect.top);
        initialScaleDistance = Math.hypot(e.clientX - scaleCenter.x, e.clientY - scaleCenter.y);
        initialUniformScale = access(scale).x; // assuming uniform
      },
      onPointerMove: (e: PointerEvent) => {
        if (initialScaleDistance === 0) return;
        const currentDistance = Math.hypot(e.clientX - scaleCenter.x, e.clientY - scaleCenter.y);
        const newUniformScale = initialUniformScale * (currentDistance / initialScaleDistance);
        setScale(access(scale).set(newUniformScale, newUniformScale));
      },
      onPointerUp: () => {
        scaleCenter.set(0, 0);
      }
    })
  };
}
