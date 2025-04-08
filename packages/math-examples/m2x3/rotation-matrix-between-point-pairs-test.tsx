import { GridSVG } from '@packages/debug-layer/grid-svg';
import { useDebugLayer } from '@packages/debug-layer/use-debug-layer';
import { getAngleBetweenPointPairs, Mat2x3 } from '@packages/math/m2x3';
import { Vec2 } from '@packages/math/v2';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo } from 'solid-js';
import { AngleSVGPreview } from './angle-svg-preview';
import { usePointMove } from './use-point-move';

export function RotationMatrixBetweenPointPairsTest(props: {
  root?: SVGSVGElement;
  debugLayer?: ReturnType<typeof useDebugLayer>;
}) {
  const p1Start = usePointMove(Vec2.create(0, 0));
  const p2Start = usePointMove(Vec2.create(100, 0));
  const p1End = usePointMove(Vec2.create(100, 100));
  const p2End = usePointMove(Vec2.create(100, 0));

  const angle = createMemo(() => {
    const _p1Start = p1Start.translation();
    const _p2Start = p2Start.translation();
    const _p1End = p1End.translation();
    const _p2End = p2End.translation();
    const angle = getAngleBetweenPointPairs(_p1Start, _p2Start, _p1End, _p2End);
    return angle;
  });

  const mat = new Mat2x3(new Float32Array(6));
  const matCss = createMemo(() => {
    const _p1Start = p1Start.translation();
    const _p2Start = p2Start.translation();
    const _p1End = p1End.translation();
    const _p2End = p2End.translation();

    return mat.getTransformMatrixBetweenPointPairs(_p1Start, _p2Start, _p1End, _p2End).toCssMatrix();
  });

  createEffect(() => {
    const root = props.root;
    const debugLayer = props.debugLayer;
    console.log('add pointermove listener', props.debugLayer);
    if (!root || !debugLayer) return;

    createEventListener(root, 'pointerdown', (e) => {
      debugLayer.updateCircule('pointer ' + e.pointerId, [e.clientX, e.clientY]);
    });

    createEventListener(root, 'pointermove', (e) => {
      if (e.pressure === 0) {
        return;
      }
      debugLayer.updateCircule('pointer ' + e.pointerId, [e.clientX, e.clientY]);
    });
  });

  return (
    <>
      <AngleSVGPreview class="translate-x-150px translate-y-150px" radius={80} angle={angle()} />
      <g class="translate-x-100px translate-y-100px">
        <GridSVG />
        <g
          style={{
            transform: matCss()
          }}
        >
          <rect x="0" y="0" width="100" height="100" fill="red" opacity={0.5} />
          <GridSVG color="blue" />
        </g>

        {[[p1Start, p2Start, 'black'] as const, [p1End, p2End, 'blue'] as const].map(([p1, p2, color]) => (
          <line
            x1={p1.translation().x}
            y1={p1.translation().y}
            x2={p2.translation().x}
            y2={p2.translation().y}
            stroke-width={2}
            stroke={color}
          />
        ))}

        {[p1Start, p2Start, p1End, p2End].map((p) => (
          <>
            <circle
              class="peer"
              cx={p.translation().x}
              cy={p.translation().y}
              r="20"
              fill="transparent"
              onPointerDown={p.handlePointerDown}
            />
            <circle
              class="peer-hover:fill-red pointer-events-none transition-colors"
              cx={p.translation().x}
              cy={p.translation().y}
              r="2"
              fill="black"
            />
          </>
        ))}
      </g>
    </>
  );
}
