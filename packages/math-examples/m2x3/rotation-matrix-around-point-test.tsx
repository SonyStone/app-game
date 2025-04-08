import { GridSVG } from '@packages/debug-layer/grid-svg';
import { Mat2x3 } from '@packages/math/m2x3';
import { Degrees } from '@packages/math/types';
import { degToRad } from '@packages/math/utils/trigonometry';
import { Vec2 } from '@packages/math/v2';
import { createMemo } from 'solid-js';
import { usePointMove } from './use-point-move';

export function RotationMatrixAroundPointTest() {
  const origin = usePointMove(Vec2.create(50, 50));

  const mat = new Mat2x3(new Float32Array(6));
  const matCss = createMemo(() => mat.rotateAroundPoint(degToRad(45 as Degrees), origin.translation()).toCssMatrix());

  return (
    <g class="translate-x-100px translate-y-300px">
      <GridSVG />
      <g
        style={{
          transform: matCss(),
          'transform-origin': '0 0'
        }}
      >
        <rect x="0" y="0" width="100" height="100" fill="red" opacity={0.5} />
        <GridSVG color="blue" />
      </g>

      <circle
        class="hover:fill-red transition-colors"
        cx={origin.translation().x}
        cy={origin.translation().y}
        r="5"
        fill="black"
        onPointerDown={origin.handlePointerDown}
      />
    </g>
  );
}
