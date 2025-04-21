import { Vec2 } from '@packages/math/v2';
import { createEffect } from 'solid-js';
import { usePointMove } from './use-point-move';

export function SVGEditPoint(props: { point?: Vec2; onChange?: (point: Vec2) => void }) {
  const point = usePointMove(props.point);

  createEffect(() => {
    props.onChange?.(point.translation());
  });

  return (
    <g edit-point>
      <circle
        class="peer"
        cx={point.translation().x}
        cy={point.translation().y}
        r="20"
        fill="transparent"
        onPointerDown={point.handlePointerDown}
      />
      <circle
        class="[.peer:hover+&]:fill-red pointer-events-none transition-colors"
        cx={point.translation().x}
        cy={point.translation().y}
        r="2"
        fill="black"
      />
    </g>
  );
}
