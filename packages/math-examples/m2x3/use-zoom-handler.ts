import { useDebugLayer } from '@packages/debug-layer/use-debug-layer';
import { Mat2x3 } from '@packages/math/m2x3';
import { createStruct } from '@packages/math/utils/create-struct';
import { Vec2 } from '@packages/math/v2';
import { access, MaybeAccessor, noop } from '@solid-primitives/utils';

export function useZoomHandler({
  mat = Mat2x3.create(),
  setMat = noop,
  debugLayer = undefined
}: {
  mat?: MaybeAccessor<Mat2x3>;
  setMat?: (value: Mat2x3) => void;
  debugLayer?: ReturnType<typeof useDebugLayer>;
} = {}) {
  const [{ clientPoint, parentPoint, localPoint, zoomVec, currentMat, invMat }] = createStruct({
    clientPoint: [Vec2, Float32Array],
    parentPoint: [Vec2, Float32Array],
    localPoint: [Vec2, Float32Array],
    zoomVec: [Vec2, Float32Array],
    currentMat: [Mat2x3, Float32Array],
    invMat: [Mat2x3, Float32Array]
  });

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();

    // compute zoom factor based on wheel delta.
    // deltaY < 0 zooms in, deltaY > 0 zooms out.
    const zoomFactor = 1 - e.deltaY * 0.001;
    zoomVec.set(zoomFactor);

    clientPoint.set(e.clientX, e.clientY);
    // TODO: Get the parent element's position
    parentPoint.set(400, 100);

    currentMat.copy(access(mat));
    invMat.copy(currentMat).inverse().transformPoint(localPoint.subFrom(clientPoint, parentPoint));

    debugLayer?.updateCircule('scroll', [e.clientX, e.clientY]);
    debugLayer?.updateCircule('local', localPoint.value);

    setMat(access(mat).scaleOrigin(zoomVec, localPoint));
  };

  return { handleWheel };
}
