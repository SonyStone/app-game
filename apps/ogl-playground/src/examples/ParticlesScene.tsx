import {
  Camera,
  Geometry,
  Mesh,
  Program,
  useTime,
} from '@work-ilyas/solid-ogl';
import { createEffect, createMemo } from 'solid-js';
import type { CameraSceneProps, ParticleProgramLike } from './types';
import particlesVertex from './particles.vert?raw';
import particlesFragment from './particles.frag?raw';

const POINTS_MODE = 0;

function createParticleGeometryArgs(count: number): unknown[] {
  const position = new Float32Array(count * 3);
  const random = new Float32Array(count * 4);

  for (let index = 0; index < count; index += 1) {
    position.set([Math.random(), Math.random(), Math.random()], index * 3);
    random.set(
      [Math.random(), Math.random(), Math.random(), Math.random()],
      index * 4,
    );
  }

  return [
    {
      position: { size: 3, data: position },
      random: { size: 4, data: random },
    },
  ];
}

export function ParticlesScene(props: CameraSceneProps) {
  let programRef: ParticleProgramLike | undefined;
  const geometryArgs = createParticleGeometryArgs(160);
  const time = useTime();

  const rotation = createMemo(() => [
    Math.sin(time() * 0.2) * 0.1,
    Math.cos(time() * 0.5) * 0.15,
    time() * 0.8,
  ]);

  createEffect(() => {
    if (!programRef) {
      return;
    }

    programRef.uniforms.uTime.value = time();
  });

  return (
    <>
      <Camera makeDefault={props.makeDefault} position={[0, 0, 15]} />
      <Mesh mode={POINTS_MODE} rotation={rotation()}>
        <Geometry args={geometryArgs} />
        <Program
          ref={(instance) => {
            programRef = instance as unknown as ParticleProgramLike;
          }}
          args={[
            {
              vertex: particlesVertex,
              fragment: particlesFragment,
              uniforms: {
                uTime: { value: 0 },
              },
              transparent: true,
              depthTest: false,
            },
          ]}
        />
      </Mesh>
    </>
  );
}
