import { useDebugLayer } from '@packages/debug-layer/use-debug-layer';
import { Mat2x3 } from '@packages/math/m2x3';
import { Degrees } from '@packages/math/types';
import { degToRad } from '@packages/math/utils/trigonometry';
import { createSignal } from 'solid-js';
import { RotationMatrixAroundPointTest } from './rotation-matrix-around-point-test';
import { RotationMatrixBetweenPointPairsTest } from './rotation-matrix-between-point-pairs-test';

export default function () {
  const debugLayer = useDebugLayer();

  const [ref, setRef] = createSignal<SVGSVGElement | undefined>(undefined);

  const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * 9);
  const array2 = new Mat2x3(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * 3, 6));
  array2.identity().createRotation(degToRad(45 as Degrees));
  console.log(array2);

  return (
    <div>
      <div class="p-4 text-sm">
        <h1>Math Examples</h1>
      </div>
      {/* Debug svg layer */}
      <svg ref={setRef} class="fixed right-0 top-0 z-10 h-screen w-screen touch-none">
        {debugLayer.layer}
        <RotationMatrixBetweenPointPairsTest root={ref()} debugLayer={debugLayer} />
        <RotationMatrixAroundPointTest />
      </svg>
    </div>
  );
}
