import { Camera, Vec3 } from '@packages/ogl';
import { Vec4Tuple } from '@packages/ogl/math/vec-4';
import { Listen } from '@solid-primitives/event-bus';
import { Show, createSignal } from 'solid-js';

export const Intersection = (props: {
  camera: Camera;
  worldSpaceToScreenSpace: (point: Vec4Tuple) => Vec4Tuple;
  screenSpaceToWorldSpace: (point: Vec4Tuple) => Vec4Tuple;
  update: Listen<void>;
}) => {
  const pointOnScreen = [0.5, 0.5];

  const cameraPosition = props.camera.position.clone();
  cameraPosition[3] = 1;

  const [getRaycastDirection, setRaycastDirection] = createSignal<Vec4Tuple | undefined>(undefined);
  const [getCameraPosition, setCameraPosition] = createSignal<Vec4Tuple | undefined>(undefined);
  const [getIntersectPosition, setIntersectPosition] = createSignal<Vec4Tuple | undefined>(undefined);

  let point: Vec3;
  let direction: Vec3;

  props.update(() => {
    if (!point) {
      const p = props.screenSpaceToWorldSpace([...pointOnScreen, 0.5, 1]);

      direction = new Vec3(...p);
      direction.sub(cameraPosition).normalize();

      const planeNormal = new Vec3(0, 0, 1);
      const denom = planeNormal.dot(direction);
      const t = -cameraPosition[2] / denom;
      cameraPosition.clone().scale;

      point = cameraPosition.clone().add(direction.clone().scale(t));
    }

    setIntersectPosition(props.worldSpaceToScreenSpace(point));
    setRaycastDirection(props.worldSpaceToScreenSpace(direction));
    setCameraPosition(props.worldSpaceToScreenSpace(cameraPosition));
  });

  return (
    <>
      <Show when={getCameraPosition()}>
        {(item) => (
          <circle id="camera-position" class="text-yellow" fill="currentcolor" cx={item()[0]} cy={item()[1]} r=".02" />
        )}
      </Show>
      <Show when={getRaycastDirection()}>
        {(item) => (
          <circle
            id="raycast-direction"
            class="text-yellow"
            fill="currentcolor"
            cx={item()[0]}
            cy={item()[1]}
            r=".02"
          />
        )}
      </Show>

      {/* intersection */}
      <Show when={getIntersectPosition()}>
        {(item) => <circle class="text-yellow" fill="currentcolor" cx={item()[0]} cy={item()[1]} r=".02" />}
      </Show>

      <Show when={getCameraPosition() && getIntersectPosition()}>
        <line
          x1={getCameraPosition()![0]}
          y1={getCameraPosition()![1]}
          x2={getIntersectPosition()![0]}
          y2={getIntersectPosition()![1]}
          class="text-yellow"
          stroke="currentcolor"
          stroke-width={0.01}
        />
      </Show>
    </>
  );
};
