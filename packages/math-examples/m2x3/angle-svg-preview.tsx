import { Radians } from '@packages/math/types';
import { radToDeg } from '@packages/math/utils/trigonometry';
import { createMemo, mergeProps } from 'solid-js';

export function AngleSVGPreview(props: { angle: Radians; class?: string; radius?: number }) {
  const merged = mergeProps({ angle: 0, radius: 100, class: '' }, props);
  const anglePoints = createMemo(() => {
    return {
      x: Math.cos(props.angle) * merged.radius,
      y: Math.sin(props.angle) * merged.radius
    };
  });

  const angle = createMemo(() => `${radToDeg(props.angle).toFixed(0)}º`);

  return (
    <g class={props.class}>
      {/* draw angle with arc */}
      <path
        d={
          `M 0 0` +
          `L ${merged.radius} 0` +
          `A ${merged.radius} ${merged.radius} 0 0 ${0 > anglePoints().y ? 0 : 1} ${anglePoints().x} ${
            anglePoints().y
          }` +
          `z`
        }
        fill="none"
        stroke="black"
      />
      <text class="select-none" x="20" y="40" fill="black" font-size="20">
        {angle()}
      </text>
    </g>
  );
}
