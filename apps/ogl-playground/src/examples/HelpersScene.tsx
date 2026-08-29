import {
  AxesHelper,
  Box,
  Camera,
  createShared,
  FaceNormalsHelper,
  GridHelper,
  Mesh,
  Orbit,
  Program,
  Sphere,
  useTime,
  VertexNormalsHelper
} from '@work-ilyas/solid-ogl';
import { createMemo, createSignal, createTrackedEffect, onCleanup, Show } from 'solid-js';
import helperFragment from './helper.frag?raw';
import helperVertex from './helper.vert?raw';
import type { CameraSceneProps, OrbitLike } from './types';

export function HelpersScene(props: CameraSceneProps) {
  const [camera, setCamera] = createSignal<unknown>();
  const [controls, setControls] = createSignal<OrbitLike>();
  const [sphereMesh, setSphereMesh] = createSignal<unknown>();
  const [cubeMesh, setCubeMesh] = createSignal<unknown>();
  const time = useTime();

  const DemoProgram = createShared(() => (
    <Program
      args={[
        {
          vertex: helperVertex,
          fragment: helperFragment
        }
      ]}
    />
  ));

  const sphereScale = createMemo(() => [1, Math.cos(time() * 1.2) * 2, 1]);
  const cubeRotation = createMemo(() => [0, -time(), 0]);

  createTrackedEffect(() => {
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
        position={[1, 1, 7]}
        lookAt={[0, 0.4, 0]}
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

      <Mesh
        ref={(instance) => {
          setSphereMesh(instance);
        }}
        position={[-0.75, 0.5, 0]}
        scale={sphereScale()}
      >
        <Sphere />
        <DemoProgram />
      </Mesh>

      <Mesh
        ref={(instance) => {
          setCubeMesh(instance);
        }}
        position={[0.75, 0.5, 0]}
        rotation={cubeRotation()}
      >
        <Box />
        <DemoProgram />
      </Mesh>

      <Show when={sphereMesh()}>
        {(mesh) => (
          <>
            <VertexNormalsHelper args={[mesh(), { size: 0.22 }]} />
            <FaceNormalsHelper args={[mesh(), { size: 0.16 }]} />
          </>
        )}
      </Show>

      <Show when={cubeMesh()}>
        {(mesh) => (
          <>
            <VertexNormalsHelper args={[mesh(), { size: 0.24 }]} />
            <FaceNormalsHelper args={[mesh(), { size: 0.18 }]} />
          </>
        )}
      </Show>

      <GridHelper args={[{ size: 10, divisions: 10 }]} position={[0, -0.001, 0]} />
      <AxesHelper args={[{ size: 6, symmetric: true }]} />
    </>
  );
}
