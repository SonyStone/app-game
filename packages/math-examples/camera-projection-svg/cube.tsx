import { Vec3 } from '@packages/ogl';
import { Vec4Tuple } from '@packages/ogl/math/vec-4';
import { Listen } from '@solid-primitives/event-bus';
import { Index, Show, createSignal } from 'solid-js';
import { Polygon } from './polygon';

export const Cube = (props: { worldSpaceToScreenSpace: (point: Vec4Tuple) => Vec4Tuple; update: Listen<void> }) => {
  // like a vertex buffer
  const [vertex, setVertex] = createSignal<Vec4Tuple[]>([]);

  const size = 1;
  const points = [
    new Vec3(0, 0, 0),
    new Vec3(size, 0, 0),
    new Vec3(0, size, 0),
    new Vec3(size, size, 0),
    new Vec3(0, 0, size),
    new Vec3(size, 0, size),
    new Vec3(0, size, size),
    new Vec3(size, size, size)
  ];

  // like an index buffer
  const indexs = [0, 1, 3, 2, 0, 4, 5, 7, 6, 4, 0, 2, 6, 7, 3, 1, 5];

  props.update(() => {
    const updatedPoints = points.map(props.worldSpaceToScreenSpace);
    setVertex(updatedPoints);
  });

  return (
    <>
      {/* cube */}
      <Index each={vertex()}>
        {(point) => <circle class="text-green" fill="currentcolor" cx={point()[0]} cy={point()[1]} r=".02" />}
      </Index>
      <Show when={vertex().length > 0}>
        <Polygon vertexs={vertex()} indexs={indexs} offset={0} fill="red" />

        <Index each={indexs}>
          {(id, i) => (
            <Show when={vertex()}>
              {(item) =>
                item()[indexs[i + 1]] && (
                  <line
                    x1={item()[id()][0]}
                    y1={item()[id()][1]}
                    x2={item()[indexs[i + 1]][0]}
                    y2={item()[indexs[i + 1]][1]}
                    attr:data-z={vertex()[id()][2]}
                    stroke="black"
                    stroke-width={0.01}
                  />
                )
              }
            </Show>
          )}
        </Index>
      </Show>
    </>
  );
};
