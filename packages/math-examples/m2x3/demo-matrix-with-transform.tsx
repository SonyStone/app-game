import { GridSVG } from '@packages/debug-layer/grid-svg';
import { useDebugLayer } from '@packages/debug-layer/use-debug-layer';
import { Mat2x3 } from '@packages/math/m2x3';
import { rotateAroundPoint, scaleAroundPoint } from '@packages/math/m2x3-functions';
import { Transform } from '@packages/math/transform';
import { Degrees } from '@packages/math/types';
import { degToRad } from '@packages/math/utils/trigonometry';
import { createSignal } from 'solid-js';

export function TestMatrixWithTransform(props: { debugLayer?: ReturnType<typeof useDebugLayer> }) {
  const [mat, setMat] = createSignal(
    Mat2x3.create().compose(
      Transform.create()
        .setPosition(400, 300)
        .setRotation(degToRad(45 as Degrees))
        .setScale(1.15)
    ),
    { equals: () => false }
  );

  setMat((mat) => {
    rotateAroundPoint(mat.value, mat.value, degToRad(30 as Degrees), [450, 350]);
    scaleAroundPoint(mat.value, mat.value, [1.5, 1.5], [450, 350]);
    return mat;
  });

  return (
    <>
      <g
        style={{
          transform: mat().toCssMatrix(),
          'transform-origin': '0 0'
        }}
      >
        <rect x="0" y="0" width="100" height="100" fill="red" opacity={0.5} />
        <GridSVG color="blue" />
        {/* Zoom in percent */}
      </g>
      <g>
        <circle cx={450} cy={350} r={5} fill="black" />
      </g>
      <g id="transform-matrix-test" class="translate-x-400px translate-y-300px">
        <GridSVG />
      </g>
    </>
  );
}
