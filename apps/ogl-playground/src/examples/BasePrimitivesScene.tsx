import {
  Box,
  Camera,
  Cylinder,
  Mesh,
  Orbit,
  Plane,
  Program,
  Sphere,
  useTime,
} from '@work-ilyas/solid-ogl';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from 'solid-js';
import type { CameraSceneProps, OrbitLike } from './types';
import primitiveVertex from './primitive.vert?raw';
import primitiveFragment from './primitive.frag?raw';

type PrimitiveShape = {
  key: string;
  kind: 'plane' | 'sphere' | 'box' | 'cylinder';
  position: readonly [number, number, number];
  speed: number;
};

const primitiveShapes: readonly PrimitiveShape[] = [
  { key: 'plane', kind: 'plane', position: [0, 1.3, 0], speed: 0.8 },
  { key: 'sphere', kind: 'sphere', position: [1.3, 0, 0], speed: 1.1 },
  { key: 'box', kind: 'box', position: [0, -1.3, 0], speed: 1.35 },
  { key: 'cylinder', kind: 'cylinder', position: [-1.3, 0, 0], speed: 0.7 },
];

export function BasePrimitivesScene(props: CameraSceneProps) {
  const [camera, setCamera] = createSignal<unknown>();
  const [controls, setControls] = createSignal<OrbitLike>();
  const time = useTime();

  createEffect(() => {
    time();
    controls()?.update();
  });

  onCleanup(() => {
    controls()?.remove();
  });

  return (
    <>
      <Camera
        ref={(instance) => {
          setCamera(instance);
        }}
        makeDefault={props.makeDefault}
        position={[0, 1, 7]}
        lookAt={[0, 0, 0]}
      />

      <Show when={camera()}>
        {(cameraInstance) => (
          <Orbit
            ref={(instance) => {
              setControls(instance as OrbitLike);
            }}
            args={[cameraInstance()]}
          />
        )}
      </Show>

      <For each={primitiveShapes}>
        {(shape) => {
          const rotation = createMemo(() => [0, -time() * shape.speed, 0]);

          return (
            <Mesh position={shape.position} rotation={rotation()}>
              {shape.kind === 'plane' ? (
                <Plane />
              ) : shape.kind === 'sphere' ? (
                <Sphere />
              ) : shape.kind === 'box' ? (
                <Box />
              ) : (
                <Cylinder />
              )}
              <Program
                args={[
                  {
                    vertex: primitiveVertex,
                    fragment: primitiveFragment,
                    cullFace: false,
                  },
                ]}
              />
            </Mesh>
          );
        }}
      </For>
    </>
  );
}
