import { DebugLayer } from '@packages/debug-layer/use-debug-layer';
import { getAngleBetweenPointPairs, getRotationMatrixBetweenPointPairs, Mat2x3 } from '@packages/math/m2x3';
import { Radians } from '@packages/math/types';
import { Vec2 } from '@packages/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';
import { usePointerDownHandler } from './use-pointer-down-handler';

export function useRotateHandler({
  ref = undefined,
  origin = new Vec2(),
  mat = new Mat2x3().identity(),
  setMat = noop,
  debugLayer = undefined
}: {
  ref?: MaybeAccessor<HTMLDivElement | undefined>;
  origin?: MaybeAccessor<Vec2>;
  mat?: MaybeAccessor<Mat2x3>;
  setMat?: (value: Mat2x3) => void;
  debugLayer?: DebugLayer;
} = {}) {
  let startPoint: Vec2 | null = null;
  let pivotPoint: Vec2 | null = null;
  let startMatrix = new Mat2x3().identity();
  const snapAngle = (Math.PI / 12) as Radians; // 15° increments

  return {
    handleRotatePointerDown: usePointerDownHandler({
      onPointerDown: (e: PointerEvent) => {
        window.getSelection()?.removeAllRanges();
        const _ref = access(ref);
        if (!_ref) return;

        // Get element position
        const rect = _ref.getBoundingClientRect();

        // Get origin in screen coordinates
        const _origin = access(origin);
        pivotPoint = Vec2.create(rect.left + _origin.x, rect.top + _origin.y);

        // Get pointer position
        startPoint = Vec2.create(e.clientX, e.clientY);

        // Store current matrix
        startMatrix = startMatrix.copy(access(mat));
      },
      onPointerMove: (e: PointerEvent) => {
        if (!pivotPoint || !startPoint || !startMatrix) return;

        // Current pointer position
        const currentPoint: Vec2 = Vec2.create(e.clientX, e.clientY);

        debugLayer?.updateLine('rotateLine1', pivotPoint, startPoint);
        debugLayer?.updateLine('rotateLine2', pivotPoint, currentPoint);

        let angle = getAngleBetweenPointPairs(pivotPoint, startPoint, pivotPoint, currentPoint);

        // Calculate rotation matrix between point pairs

        // Apply snapping if shift key is pressed
        if (e.shiftKey) {
          angle = (Math.round(angle / snapAngle) * snapAngle) as Radians;
        }

        debugLayer?.updatePoint('pivotPoint', pivotPoint);

        const rotationMat = getRotationMatrixBetweenPointPairs(pivotPoint, angle, new Mat2x3());

        debugLayer?.updateGroup('rotationMat', rotationMat);

        // Update the matrix
        setMat(rotationMat);
      },
      onPointerUp: () => {
        pivotPoint = null;
        startPoint = null;
      }
    })
  };
}
