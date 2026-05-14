import { GridSVG } from '@app-game/debug-layer/grid-svg';
import { useDebugLayer } from '@app-game/debug-layer/use-debug-layer';
import { Line } from '@app-game/math/line';
import { Mat2x3 } from '@app-game/math/m2x3';
import { createStruct } from '@app-game/math/utils/create-struct';
import { Vec2 } from '@app-game/math/v2';
import { createEventListener } from '@solid-primitives/event-listener';
import { createEffect, createMemo, createSignal } from 'solid-js';
import { SVGEditPoint } from './svg-edit-point';
import { SVGSegmentAngleVisualization } from './svg-segment-angle-visualization';

export function TestRotationMatrixBetweenPointPairs(props: {
  root?: SVGSVGElement;
  debugLayer?: ReturnType<typeof useDebugLayer>;
}) {
  const [{ vec1, vec2, vec3, vec4, mat }] = createStruct({
    vec1: [Vec2, Int16Array],
    vec2: [Vec2, Int16Array],
    vec3: [Vec2, Int16Array],
    vec4: [Vec2, Int16Array],
    mat: [Mat2x3, Float32Array]
  });

  const startLine = new Line(vec1.set(0, 0), vec2.set(100, 0));
  const endLine = new Line(vec3.set(100, 100), vec4.set(100, 0));

  const [update, setUpdate] = createSignal<void>(undefined, { equals: false });
  const points = [vec1, vec2, vec3, vec4].map((v) =>
    createMemo(
      () => {
        update();
        return v;
      },
      v,
      {
        equals: false
      }
    )
  );

  const matCss = createMemo(() => {
    update();

    return mat
      .getTransformMatrixBetweenPointPairs(startLine.start, startLine.end, endLine.start, endLine.end)
      .toCssMatrix();
  });

  createEffect(() => {
    const root = props.root;
    const debugLayer = props.debugLayer;
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
      {/* <SVGAnglePreview class="translate-x-150px translate-y-150px" radius={80} angle={angle()} /> */}
      <g class="translate-x-100px translate-y-100px">
        <SVGSegmentAngleVisualization
          point1Start={points[0]()}
          point1End={points[1]()}
          point2Start={points[2]()}
          point2End={points[3]()}
        />
        <GridSVG />
        <g
          style={{
            transform: matCss()
          }}
        >
          <rect x="0" y="0" width="100" height="100" fill="red" opacity={0.5} />
          <GridSVG color="blue" />
        </g>

        {[[points[0], points[1], 'black'] as const, [points[2], points[3], 'blue'] as const].map(([p1, p2, color]) => (
          <line x1={p1().x} y1={p1().y} x2={p2().x} y2={p2().y} stroke-width={2} stroke={color} />
        ))}

        {[startLine.start, startLine.end, endLine.start, endLine.end].map((p) => (
          <SVGEditPoint point={p} onChange={setUpdate} />
        ))}
      </g>
    </>
  );
}
