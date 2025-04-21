import { useDebugLayer } from '@packages/debug-layer/use-debug-layer';
import { Mat2x3 } from '@packages/math/m2x3';
import { createStruct } from '@packages/math/utils/create-struct';
import { Vec2 } from '@packages/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';
import { usePointerDownHandler } from './use-pointer-down-handler';

export function usePanHandler2({
  mat = Mat2x3.create(),
  setMat = noop,
  debugLayer = undefined
}: {
  mat?: MaybeAccessor<Mat2x3>;
  setMat?: (value: Mat2x3) => void;
  debugLayer?: ReturnType<typeof useDebugLayer>;
} = {}) {
  const [{ screenPointStart, screenPointMove, startMat, relativeChange, scale }] = createStruct({
    screenPointStart: [Vec2, Float32Array],
    screenPointMove: [Vec2, Float32Array],
    startMat: [Mat2x3, Float32Array],
    relativeChange: [Vec2, Float32Array],
    scale: [Vec2, Float32Array]
  });

  return {
    handlePointerDown: usePointerDownHandler({
      // on pointer down on the button, add listeners to track pointer movement
      onPointerDown: (e: PointerEvent) => {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        screenPointStart.set(e.clientX, e.clientY);

        startMat.copy(access(mat));
      },
      // update the matrix on pointer move with current pointer coordinates
      onPointerMove: (e: PointerEvent) => {
        screenPointMove.set(e.clientX, e.clientY);
        const _mat = access(mat);

        _mat.getScale(scale);

        // calculate the relative change
        relativeChange.subFrom(screenPointMove, screenPointStart).div(scale);

        debugLayer?.updateLine('move', screenPointStart.value, screenPointMove.value, 'green');

        setMat(_mat.copy(startMat).translate(relativeChange));
      },
      onPointerUp: () => {}
    })
  };
}
