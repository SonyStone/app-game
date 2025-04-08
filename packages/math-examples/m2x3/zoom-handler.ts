import { Vec2 } from '@packages/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';

export function useZoomHandler({
  ref = undefined,
  translation = Vec2.create(0, 0),
  scale = Vec2.create(1, 1),
  setScale = noop,
  setTranslation = noop
}: {
  ref?: MaybeAccessor<HTMLDivElement | undefined>;
  scale?: MaybeAccessor<Vec2>;
  translation?: MaybeAccessor<Vec2>;
  setScale?: (value: Vec2) => void;
  setTranslation?: (value: Vec2) => void;
} = {}) {
  const pointerPos = Vec2.create(0, 0);
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const _ref = access(ref);
    if (!_ref) return;

    // compute zoom factor based on wheel delta.
    // deltaY < 0 zooms in, deltaY > 0 zooms out.
    const zoomFactor = 1 - e.deltaY * 0.001;
    const _scale = access(scale).mulScalar(zoomFactor);

    // get red box bounding rectangle to compute the pointer position relative to the box.
    const rect = _ref.getBoundingClientRect();
    pointerPos.set(e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2);

    // With transformOrigin set to "0 0", the element's transform:
    // newTranslation = oldTranslation + (1 - zoomFactor) * pointerPos
    const newTranslation = access(translation)
      .addScalar(1 - zoomFactor)
      .mul(pointerPos);

    setScale(_scale);
    setTranslation(newTranslation);
  };

  return { handleWheel };
}
