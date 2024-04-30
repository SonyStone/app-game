import { Vec4Tuple } from '@packages/ogl/math/vec-4';
import { Listen } from '@solid-primitives/event-bus';
import { Index, createSignal } from 'solid-js';

export function Grid(props: { worldSpaceToScreenSpace: (point: Vec4Tuple) => Vec4Tuple; update: Listen<void> }) {
  const lines = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((line) => [
    [-5, 0, line],
    [5, 0, line],
    [line, 0, -5],
    [line, 0, 5]
  ]);

  const [getScreenPoints, setScreenPoints] = createSignal<Vec4Tuple[][]>([]);

  props.update(() => {
    const updatedPoints = lines.map((l) => l.map(props.worldSpaceToScreenSpace));
    setScreenPoints(updatedPoints);
  });

  return (
    <g>
      <Index each={getScreenPoints()}>
        {(line) => (
          <>
            <line
              x1={line()[0][0]}
              y1={line()[0][1]}
              x2={line()[1][0]}
              y2={line()[1][1]}
              stroke="black"
              stroke-width={0.0005}
            />
            <line
              x1={line()[2][0]}
              y1={line()[2][1]}
              x2={line()[3][0]}
              y2={line()[3][1]}
              stroke="black"
              stroke-width={0.0005}
            />
          </>
        )}
      </Index>
    </g>
  );
}
