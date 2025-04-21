import { useDebugLayer } from '@packages/debug-layer/use-debug-layer';
import { getAngleBetweenPointPairs, Mat2x3 } from '@packages/math/m2x3';
import { rotateAroundPoint, scaleAroundPoint } from '@packages/math/m2x3-functions';
import { Radians } from '@packages/math/types';
import { createStruct } from '@packages/math/utils/create-struct';
import { Vec1 } from '@packages/math/v1';
import { Vec2 } from '@packages/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';
import { usePointerDownHandler } from './use-pointer-down-handler';

export function useTransformHandler({
  mat = Mat2x3.create(),
  setMat = noop,
  debugLayer = undefined
}: {
  mat?: MaybeAccessor<Mat2x3>;
  setMat?: (value: Mat2x3) => void;
  debugLayer?: ReturnType<typeof useDebugLayer>;
} = {}) {
  const [
    {
      clientPointDown,
      clientPointMove,
      clientPointUp,
      clientPointWheel,
      relativeChange,
      matDown,
      scale,
      scalePosition,
      position,
      rotation,
      rotationPosition
    }
  ] = createStruct({
    clientPointDown: [Vec2, Float32Array],
    clientPointMove: [Vec2, Float32Array],
    clientPointUp: [Vec2, Float32Array],
    clientPointWheel: [Vec2, Float32Array],
    matDown: [Mat2x3, Float32Array],
    relativeChange: [Vec2, Float32Array],
    position: [Vec2, Float32Array],
    scale: [Vec2, Float32Array],
    scalePosition: [Vec2, Float32Array],
    rotation: [Vec1, Float32Array],
    rotationPosition: [Vec2, Float32Array]
  });

  const snapAngle = (Math.PI / 12) as Radians; // 15° increments

  let isRotationPositionSet = false;
  const rotationDetectRadius = 15;

  let isScalePositionSet = false;
  const scaleDetectRadius = 100;

  let state: 'translate' | 'rotate' | 'scale' = 'translate';

  return {
    handleWheel: (e: WheelEvent) => {
      e.preventDefault();
      clientPointWheel.set(e.clientX, e.clientY);
      const _mat = access(mat);

      // compute zoom factor based on wheel delta.
      // deltaY < 0 zooms in, deltaY > 0 zooms out.
      const zoomFactor = 1 - e.deltaY * 0.001;
      scale.set(zoomFactor, zoomFactor);

      // TODO: Get the parent element's position

      scaleAroundPoint(_mat.value, _mat.value, scale.value, clientPointWheel.value);

      debugLayer?.updateCircule('scroll', clientPointWheel.value);

      setMat(_mat);
    },
    handlePointerDown: usePointerDownHandler({
      // on pointer down on the button, add listeners to track pointer movement
      onPointerDown: (e: PointerEvent) => {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();
        clientPointDown.set(e.clientX, e.clientY);
        matDown.copy(access(mat));
        isRotationPositionSet = false;
        isScalePositionSet = false;

        if (e.ctrlKey) {
          state = 'scale';
        } else if (e.altKey) {
          state = 'rotate';
        } else {
          state = 'translate';
        }
      },
      // update the matrix on pointer move with current pointer coordinates
      onPointerMove: (e: PointerEvent) => {
        clientPointMove.set(e.clientX, e.clientY);
        relativeChange.subFrom(clientPointMove, clientPointDown);
        const _mat = access(mat).copy(matDown);

        if (state === 'rotate') {
          // rotate
          if (!isRotationPositionSet) {
            debugLayer?.updateCircule('rotate-detect', clientPointDown.value, 'blue', rotationDetectRadius);
            if (relativeChange.len() >= rotationDetectRadius) {
              rotationPosition.copy(clientPointMove);
              isRotationPositionSet = true;
            }
          } else {
            rotation.val = getAngleBetweenPointPairs(
              clientPointDown,
              rotationPosition,
              clientPointDown,
              clientPointMove
            );
            if (e.shiftKey) {
              rotation.val = (Math.round(rotation.val / snapAngle) * snapAngle) as Radians;
            }

            rotateAroundPoint(_mat.value, _mat.value, rotation.val as Radians, clientPointDown.value);

            debugLayer?.updateLine('rotate-start', clientPointDown.value, rotationPosition.value, 'blue');
            debugLayer?.updateLine('rotate-end', clientPointDown.value, clientPointMove.value, 'blue');

            setMat(_mat);
          }
        } else if (state === 'scale') {
          // scale
          if (!isScalePositionSet) {
            debugLayer?.updateCircule('scale-detect', clientPointDown.value, 'red', scaleDetectRadius);
            if (relativeChange.len() >= scaleDetectRadius) {
              scalePosition.copy(clientPointMove);
              isScalePositionSet = true;
            }
          } else {
            const _scale = relativeChange.len() / scaleDetectRadius;
            _mat.getScale(scale);
            // scale.addScalar(_scale);

            scaleAroundPoint(_mat.value, _mat.value, [_scale, _scale], clientPointDown.value);

            debugLayer?.updateLine('scale', clientPointDown.value, clientPointMove.value, 'red');
            setMat(_mat);
          }
        } else if (state === 'translate') {
          // translate
          isRotationPositionSet = false;
          isScalePositionSet = false;
          debugLayer?.updateLine('position', clientPointDown.value, clientPointMove.value, 'green');
          _mat.value[Mat2x3.M02] += relativeChange.x;
          _mat.value[Mat2x3.M12] += relativeChange.y;
          if (e.shiftKey) {
            _mat.value[Mat2x3.M02] = Math.round(_mat.value[Mat2x3.M02] / 10) * 10;
            _mat.value[Mat2x3.M12] = Math.round(_mat.value[Mat2x3.M12] / 10) * 10;
          } else {
            _mat.value[Mat2x3.M02] = Math.round(_mat.value[Mat2x3.M02]);
            _mat.value[Mat2x3.M12] = Math.round(_mat.value[Mat2x3.M12]);
          }
          setMat(_mat);
        }
      },
      onPointerUp: (e: PointerEvent) => {
        clientPointUp.set(e.clientX, e.clientY);
        isRotationPositionSet = false;
        isScalePositionSet = false;
        state = 'translate';
      }
    })
  };
}
