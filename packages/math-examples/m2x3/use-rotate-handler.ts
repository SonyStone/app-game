import { DebugLayer } from '@packages/debug-layer/use-debug-layer';
import { getAngleBetweenPointPairs, getRotationMatrixBetweenPointPairs, Mat2x3 } from '@packages/math/m2x3';
import { Radians } from '@packages/math/types';
import { createStruct } from '@packages/math/utils/create-struct';
import { Vec1 } from '@packages/math/v1';
import { Vec2 } from '@packages/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';
import { usePointerDownHandler } from './use-pointer-down-handler';

export function useRotateHandler({
  origin = new Vec2(),
  mat = new Mat2x3().identity(),
  setMat = noop,
  debugLayer = undefined
}: {
  origin?: MaybeAccessor<Vec2>;
  mat?: MaybeAccessor<Mat2x3>;
  setMat?: (value: Mat2x3) => void;
  debugLayer?: DebugLayer;
} = {}) {
  const [{ screenPointStart, screenPointMove, relativeChange, startPostition, rotation }] = createStruct({
    screenPointStart: [Vec2, Float32Array],
    screenPointMove: [Vec2, Float32Array],
    startPostition: [Vec2, Float32Array],
    relativeChange: [Vec2, Float32Array],
    rotation: [Vec1, Float32Array]
  });

  const pivotPoint = Vec2.create(0, 0);
  let startMatrix = new Mat2x3().identity();
  const snapAngle = (Math.PI / 12) as Radians; // 15° increments

  return {
    handleRotatePointerDown: usePointerDownHandler({
      onPointerDown: (e: PointerEvent) => {
        if (!e.altKey) {
          return;
        }
        window.getSelection()?.removeAllRanges();
        screenPointStart.set(e.clientX, e.clientY);

        rotation.set(access(mat).getRotation());

        // Store current matrix
        startMatrix = startMatrix.copy(access(mat));
      },
      onPointerMove: (e: PointerEvent) => {
        if (!e.altKey) {
          return;
        }
        screenPointMove.set(e.clientX, e.clientY);

        debugLayer?.updateLine('rotateLine1', screenPointMove.value, screenPointStart.value, 'blue');

        rotation.val += getAngleBetweenPointPairs(pivotPoint, screenPointStart, pivotPoint, screenPointMove);

        // Calculate rotation matrix between point pairs

        // Apply snapping if shift key is pressed
        if (e.shiftKey) {
          rotation.val = (Math.round(rotation.val / snapAngle) * snapAngle) as Radians;
        }

        debugLayer?.updatePoint('pivotPoint', pivotPoint.value);

        setMat(getRotationMatrixBetweenPointPairs(pivotPoint, rotation.val as Radians, access(mat)));
      },
      onPointerUp: (e: PointerEvent) => {
        if (!e.altKey) {
          return;
        }
      }
    })
  };
}
