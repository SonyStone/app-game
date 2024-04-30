import { Vec3Tuple } from '@packages/math/v3-builder';
import { Vec4Tuple } from '@packages/ogl/math/vec-4';
import { normalize } from '@packages/utils/path-data-parser/normalize';
import { parsePath, serialize } from '@packages/utils/path-data-parser/parser';
import { Listen } from '@solid-primitives/event-bus';
import { createSignal } from 'solid-js';

export const SvgPath = (props: {
  path: string;
  position?: Vec3Tuple;
  worldSpaceToScreenSpace: (point: Vec4Tuple) => Vec4Tuple;
  update: Listen<void>;
}) => {
  const [d, setD] = createSignal<string>('');
  const data = normalize(parsePath(props.path));

  props.update(() => {
    const position = props.position ?? [0, 0, 0];
    const transformedShape = data.map(({ key, data }) => {
      data = data.map((d) => d / 10);
      switch (key) {
        case 'L':
        case 'M': {
          const clipSpaceVertex = props.worldSpaceToScreenSpace([
            data[0] + position[0],
            data[1] + position[1],
            position[2],
            1
          ]);
          return { key, data: [clipSpaceVertex[0], clipSpaceVertex[1]] };
        }
        case 'C': {
          const clipSpaceVertex = [
            props.worldSpaceToScreenSpace([data[0] + position[0], data[1] + position[1], position[2], 1]),
            props.worldSpaceToScreenSpace([data[2] + position[0], data[3] + position[1], position[2], 1]),
            props.worldSpaceToScreenSpace([data[4], data[5], -1, 1])
          ];

          return {
            key,
            data: [
              clipSpaceVertex[0][0],
              clipSpaceVertex[0][1],
              clipSpaceVertex[1][0],
              clipSpaceVertex[1][1],
              clipSpaceVertex[2][0],
              clipSpaceVertex[2][1]
            ]
          };
        }
        default: {
          return { key, data };
        }
      }
    });
    setD(serialize(transformedShape));
  });

  return (
    <path
      class="text-blueGray"
      d={d()}
      stroke-width="0.04"
      stroke="currentcolor"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  );
};
