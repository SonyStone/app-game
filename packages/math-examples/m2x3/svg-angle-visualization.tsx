import { Degrees, Radians } from '@packages/math/types';
import { createStruct } from '@packages/math/utils/create-struct';
import { radToDeg } from '@packages/math/utils/trigonometry';
import { Vec2 } from '@packages/math/v2';
import { createMemo, mergeProps } from 'solid-js';

// one struct is enough for all angle visualizations
const [struct] = createStruct({
  firstPoint: [Vec2, Float32Array],
  cornerPoint: [Vec2, Float32Array],
  secondPoint: [Vec2, Float32Array],
  vectorToFirstPoint: [Vec2, Float32Array],
  vectorToSecondPoint: [Vec2, Float32Array],
  arcStartPoint: [Vec2, Float32Array],
  arcEndPoint: [Vec2, Float32Array]
});

/**
 * Visualizes an angle between three points with an arc and optional measurement text
 *
 * - `A rx ry x-axis-rotation large-arc-flag sweep-flag x y`
 * - `a rx ry x-axis-rotation large-arc-flag sweep-flag dx dy`
 * x-radius and y-radius, x-axis-rotation, large-arc-flag, sweep-flag, x and y coordinates to end the stroke
 */
export function SVGAngleVisualization(props: {
  /** defining the first arm of the angle */
  firstPoint?: Vec2;
  /** Vertex point (the corner of the angle) */
  cornerPoint?: Vec2;
  /** defining the second arm of the angle */
  secondPoint?: Vec2;
  class?: string;
  /** Radius of the angle arc */
  radius?: number;
}) {
  const merged = mergeProps(
    {
      radius: 40,
      class: '',
      showMeasurement: true,
      firstPoint: struct.firstPoint.set(10, 0),
      cornerPoint: struct.cornerPoint.set(0, 0),
      secondPoint: struct.secondPoint.set(0, 10)
    },
    props
  );

  const vectorToFirstPoint = () =>
    struct.vectorToFirstPoint.copy(merged.firstPoint).sub(merged.cornerPoint).normalize();

  const vectorToSecondPoint = () =>
    struct.vectorToSecondPoint.copy(merged.secondPoint).sub(merged.cornerPoint).normalize();

  const arcStartPoint = () =>
    struct.arcStartPoint.copy(vectorToFirstPoint()).mulScalar(merged.radius).add(merged.cornerPoint);

  const arcEndPoint = () =>
    struct.arcEndPoint.copy(vectorToSecondPoint()).mulScalar(merged.radius).add(merged.cornerPoint);

  const angle = createMemo(() => Vec2.angle(vectorToFirstPoint(), vectorToSecondPoint()));
  const angleDegrees = createMemo(() => Math.abs(Math.floor(radToDeg(angle() as Radians))) as Degrees);
  const sweepFlag = createMemo(() => Vec2.crossProduct(vectorToFirstPoint(), vectorToSecondPoint()) >= 0, 0);

  const arcPath = () =>
    angleDegrees() === 180
      ? `M ${arcStartPoint().toPath()}` + `L ${arcEndPoint().toPath()}` + `z`
      : `M ${merged.cornerPoint.toPath()}` +
        `L ${arcStartPoint().toPath()}` +
        `A ${merged.radius} ${merged.radius} 0 0 ${sweepFlag() ? 1 : 0} ${arcEndPoint().toPath()}` +
        `z`;

  return (
    <g class={props.class}>
      {/* draw angle with arc */}

      <path class="select-none" d={arcPath()} fill="none" stroke="blue" stroke-dasharray="8 4" />
      <text class="select-none" x={merged.cornerPoint.x + 2} y={merged.cornerPoint.y - 4} fill="black" font-size="20">
        {angleDegrees() + `º` + (angleDegrees() === 90 ? '⦜' : '')}
      </text>
    </g>
  );
}
