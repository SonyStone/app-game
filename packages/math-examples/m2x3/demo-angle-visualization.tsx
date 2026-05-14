import { GridSVG } from '@app-game/debug-layer/grid-svg';
import { useDebugLayer } from '@app-game/debug-layer/use-debug-layer';
import { createStruct } from '@app-game/math/utils/create-struct';
import { Vec2 } from '@app-game/math/v2';
import { createMemo, createSignal, For } from 'solid-js';
import { SVGAngleVisualization } from './svg-angle-visualization';
import { SVGEditPoint } from './svg-edit-point';

export function DemoAngleVisualization(props: { root?: SVGSVGElement; debugLayer?: ReturnType<typeof useDebugLayer> }) {
  const points = [create3Poinnt([0, 0, 0, 100, 100, 100]), create3Poinnt([10, 10, 10, 110, 110, 110])];

  return (
    <>
      <g class="translate-x-100px translate-y-500px">
        <GridSVG />
        <For each={points}>
          {({ points, setUpdate }) => (
            <>
              <line x1={points[0]().x} y1={points[0]().y} x2={points[1]().x} y2={points[1]().y} stroke="black" />
              <line x1={points[1]().x} y1={points[1]().y} x2={points[2]().x} y2={points[2]().y} stroke="black" />
              <SVGAngleVisualization firstPoint={points[0]()} cornerPoint={points[1]()} secondPoint={points[2]()} />
              {points.map((p) => (
                <SVGEditPoint point={p()} onChange={setUpdate} />
              ))}
            </>
          )}
        </For>
      </g>
    </>
  );
}

function create3Poinnt(props: [number, number, number, number, number, number]) {
  const [{ vec1, vec2, vec3 }] = createStruct({
    vec1: [Vec2, Int16Array],
    vec2: [Vec2, Int16Array],
    vec3: [Vec2, Int16Array]
  });
  const [update, setUpdate] = createSignal<void>(undefined, { equals: false });

  vec1.set(props[0], props[1]);
  vec2.set(props[2], props[3]);
  vec3.set(props[4], props[5]);

  const points = [vec1, vec2, vec3].map((v) =>
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

  return {
    points,
    setUpdate
  };
}
