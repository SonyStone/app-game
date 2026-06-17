import {
  Camera,
  createShared,
  Geometry,
  Mesh,
  Program,
  Transform,
  useOgl,
  useTime,
} from '@work-ilyas/solid-ogl';
import { createEffect, For } from 'solid-js';
import type { CameraSceneProps } from './types';

const drawModesVertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec3 position;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;

  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = 7.0;
  }
`;

const drawModesFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;

  varying vec2 vUv;

  void main() {
    gl_FragColor.rgb = 0.5 + 0.3 * sin(vUv.yxx + uTime) + vec3(0.2, 0.0, 0.1);
    gl_FragColor.a = 1.0;
  }
`;

const geometryArgs = [
  {
    position: {
      size: 3,
      data: new Float32Array([
        -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 0,
      ]),
    },
    uv: {
      size: 2,
      data: new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
    },
    index: {
      data: new Uint16Array([0, 1, 2, 1, 3, 2]),
    },
  },
] as const;

const drawModes = [
  { id: 'points', position: [-1.4, 1.4, 0] as const, mode: 'POINTS' as const },
  { id: 'lines', position: [1.4, 1.4, 0] as const, mode: 'LINES' as const },
  {
    id: 'line-loop',
    position: [-1.4, -1.4, 0] as const,
    mode: 'LINE_LOOP' as const,
  },
  {
    id: 'triangles',
    position: [1.4, -1.4, 0] as const,
    mode: 'TRIANGLES' as const,
  },
] as const;

type DrawModesProgramLike = {
  uniforms: {
    uTime: { value: number };
  };
};

export function DrawModesScene(props: CameraSceneProps) {
  const { gl } = useOgl();
  const time = useTime();
  let programRef: DrawModesProgramLike | undefined;

  const SharedGeometry = createShared(() => <Geometry args={geometryArgs} />);
  const SharedProgram = createShared(() => (
    <Program
      ref={(instance) => {
        programRef = instance as unknown as DrawModesProgramLike;
      }}
      args={[
        {
          vertex: drawModesVertex,
          fragment: drawModesFragment,
          uniforms: {
            uTime: { value: 0 },
          },
        },
      ]}
    />
  ));

  createEffect(() => {
    if (!programRef) {
      return;
    }

    programRef.uniforms.uTime.value = time();
  });

  return (
    <>
      <Camera
        makeDefault={props.makeDefault}
        position={[0, 0, 15]}
        lookAt={[0, 0, 0]}
      />

      <For each={drawModes}>
        {(mode) => (
          <Transform position={mode.position}>
            <Mesh mode={gl[mode.mode]}>
              <SharedGeometry />
              <SharedProgram />
            </Mesh>
          </Transform>
        )}
      </For>
    </>
  );
}
