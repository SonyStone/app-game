import { Vec2 } from '@packages/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';
import { usePointerDownHandler } from './use-pointer-down-handler';

export function usePanHandler({
  translation = Vec2.create(),
  setTranslation = noop
}: {
  translation?: MaybeAccessor<Vec2>;
  setTranslation?: (value: Vec2) => void;
  setTransform?: (value: string) => void;
} = {}) {
  let startPointer: Vec2 | null = null;
  let startTranslation: Vec2 = Vec2.create();

  return {
    handlePointerDown: usePointerDownHandler({
      // on pointer down on the button, add listeners to track pointer movement
      onPointerDown: (e: PointerEvent) => {
        window.getSelection()?.removeAllRanges();
        startPointer = Vec2.create(e.clientX, e.clientY);
        startTranslation = access(translation);
      },
      // update the matrix on pointer move with current pointer coordinates
      onPointerMove: (e: PointerEvent) => {
        if (!startPointer) return;
        const client = Vec2.create(e.clientX, e.clientY);

        // calculate the relative change
        const d = new Vec2().subFrom(client, startPointer);
        const newTranslation: Vec2 = new Vec2().addFrom(startTranslation, d);
        setTranslation(newTranslation);
      },
      // when pointer is released, disable tracking
      onPointerUp: () => {
        if (!startPointer) return;
        startPointer = null;
      }
    })
  };
}
