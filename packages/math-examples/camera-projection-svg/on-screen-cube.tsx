import { Camera, Vec3 } from '@packages/ogl';
import { Vec4Tuple } from '@packages/ogl/math/vec-4';
import { Listen } from '@solid-primitives/event-bus';
import { Show, createSignal } from 'solid-js';

// lets try to project the rectangale back into 3d space
export const OnScreenCube = (props: {
  camera: Camera;
  worldSpaceToScreenSpace: (point: Vec4Tuple) => Vec4Tuple;
  screenSpaceToWorldSpace: (point: Vec4Tuple) => Vec4Tuple;
  update: Listen<void>;
}) => {
  const [get, set] = createSignal<Vec4Tuple[]>([]);

  const [getCameraPosition, setCameraPosition] = createSignal<Vec4Tuple | undefined>(undefined);

  const points = [
    [0.8, 0.8, 0],
    [-0.8, 0.8, 0],
    [-0.8, -0.8, 0],
    [0.8, -0.8, 0],
    [1, 1, 0],
    [-1, 1, 0],
    [-1, -1, 0],
    [1, -1, 0]
  ];

  let worldSpace = undefined as Vec4Tuple[] | undefined;
  let cameraPosition = undefined as Vec3 | undefined;

  props.update(() => {
    if (!cameraPosition) {
      cameraPosition = props.camera.position.clone();
      cameraPosition[3] = 1;
    }

    if (!worldSpace) {
      const updatedPoints = points.map((point) => {
        const worldSpaceVertex = props.screenSpaceToWorldSpace(point);

        const direction = new Vec3(...worldSpaceVertex);
        direction.sub(cameraPosition!).normalize();

        const planeNormal = new Vec3(0, 0, 1).normalize();
        const denom = planeNormal.dot(direction);
        if (Math.abs(denom) > 1e-6) {
          const t = -cameraPosition!.dot(planeNormal) / denom;
          cameraPosition!.clone().scale;

          const intersectPoint = cameraPosition!.clone().add(direction.clone().scale(t));
          return intersectPoint;
        }

        return new Vec3();
      });

      worldSpace = updatedPoints;
    }

    const updatedPoints = worldSpace.map((point) => {
      const clipSpaceVertex = props.worldSpaceToScreenSpace(point);
      return [clipSpaceVertex[0], clipSpaceVertex[1]];
    });

    setCameraPosition(props.worldSpaceToScreenSpace(cameraPosition!));

    set(updatedPoints);
  });

  return (
    <>
      {/* screen to world projection */}
      <Show when={get().length > 0 && getCameraPosition()}>
        <polygon points={get().slice(0, 4).join(' ')} fill="none" stroke="black" stroke-width={0.001} />
        <polygon points={get().slice(4).join(' ')} fill="none" stroke="black" stroke-width={0.001} />
        <line
          x1={getCameraPosition()![0]}
          y1={getCameraPosition()![1]}
          x2={get()[4][0]}
          y2={get()[4][1]}
          stroke="black"
          stroke-width={0.001}
        />
        <line
          x1={getCameraPosition()![0]}
          y1={getCameraPosition()![1]}
          x2={get()[5][0]}
          y2={get()[5][1]}
          stroke="black"
          stroke-width={0.001}
        />
        <line
          x1={getCameraPosition()![0]}
          y1={getCameraPosition()![1]}
          x2={get()[6][0]}
          y2={get()[6][1]}
          stroke="black"
          stroke-width={0.001}
        />
        <line
          x1={getCameraPosition()![0]}
          y1={getCameraPosition()![1]}
          x2={get()[7][0]}
          y2={get()[7][1]}
          stroke="black"
          stroke-width={0.001}
        />
      </Show>
    </>
  );
};
