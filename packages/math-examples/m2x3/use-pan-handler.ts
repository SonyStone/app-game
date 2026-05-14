import { createStruct } from '@app-game/math/utils/create-struct';
import { NumberArray } from '@app-game/math/utils/typed-array';
import { Vec2 } from '@app-game/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';
import { usePointerDownHandler } from './use-pointer-down-handler';

const [{ screenPointStart, screenPointMove, relativeChange, startPostition }] = createStruct({
  screenPointStart: [Vec2, Float32Array],
  screenPointMove: [Vec2, Float32Array],
  startPostition: [Vec2, Float32Array],
  relativeChange: [Vec2, Float32Array]
});

export function usePanHandler({
  translation = Vec2.create(),
  setTranslation = noop
}: {
  translation?: MaybeAccessor<Vec2<NumberArray>>;
  setTranslation?: (value: Vec2<NumberArray>) => void;
  setTransform?: (value: string) => void;
} = {}) {
  return {
    handlePointerDown: usePointerDownHandler({
      // on pointer down on the button, add listeners to track pointer movement
      onPointerDown: (e: PointerEvent) => {
        window.getSelection()?.removeAllRanges();
        screenPointStart.set(e.clientX, e.clientY);
        startPostition.copy(access(translation));
      },
      // update the matrix on pointer move with current pointer coordinates
      onPointerMove: (e: PointerEvent) => {
        screenPointMove.set(e.clientX, e.clientY);

        // calculate the relative change
        relativeChange.subFrom(screenPointMove, screenPointStart);

        const newTranslation = access(translation).addFrom(startPostition, relativeChange);
        setTranslation(newTranslation);
      },
      // when pointer is released, disable tracking
      onPointerUp: () => {
        screenPointStart.set(0, 0);
      }
    })
  };
}
