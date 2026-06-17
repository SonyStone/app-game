import {
  Camera,
  Geometry,
  Mesh,
  Program,
  Texture,
  useTime,
} from '@work-ilyas/solid-ogl';
import { createEffect, createMemo, createResource, Show } from 'solid-js';
import type { CameraSceneProps } from './types';
import dataSrc from './acorn.json?url';
import textureSrc from './acorn.jpg?url';

const INSTANCE_COUNT = 20;

const instancingVertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec3 offset;
  attribute vec3 random;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;

  varying vec2 vUv;

  void rotate2d(inout vec2 value, float angle) {
    mat2 matrix = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    value = matrix * value;
  }

  void main() {
    vUv = uv;

    vec3 pos = position;
    pos *= 0.9 + random.y * 0.2;
    rotate2d(pos.xz, random.x * 6.28 + 4.0 * uTime * (random.y - 0.5));
    rotate2d(pos.zy, random.z * 0.5 * sin(uTime * random.x + random.z * 3.14));
    pos += offset;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const instancingFragment = /* glsl */ `
  precision highp float;

  uniform sampler2D tMap;

  varying vec2 vUv;

  void main() {
    vec3 tex = texture2D(tMap, vUv).rgb;
    gl_FragColor = vec4(tex, 1.0);
  }
`;

type AcornModel = {
  position: number[];
  normal: number[];
  uv: number[];
};

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadAcornModel() {
  const response = await fetch(dataSrc);

  if (!response.ok) {
    throw new Error(`Failed to load acorn model: ${response.status}`);
  }

  return (await response.json()) as AcornModel;
}

function createInstanceAttributes(count: number) {
  const offset = new Float32Array(count * 3);
  const random = new Float32Array(count * 3);

  for (let index = 0; index < count; index += 1) {
    offset.set(
      [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1],
      index * 3,
    );
    random.set([Math.random(), Math.random(), Math.random()], index * 3);
  }

  return { offset, random };
}

export function InstancingScene(props: CameraSceneProps) {
  const time = useTime();
  const [model] = createResource(loadAcornModel);
  const [image] = createResource(() => loadImage(textureSrc));

  const geometryArgs = createMemo(() => {
    const acorn = model();

    if (!acorn) {
      return undefined;
    }

    const instanceAttributes = createInstanceAttributes(INSTANCE_COUNT);

    return [
      {
        position: { size: 3, data: new Float32Array(acorn.position) },
        uv: { size: 2, data: new Float32Array(acorn.uv) },
        normal: { size: 3, data: new Float32Array(acorn.normal) },
        offset: {
          instanced: 1,
          size: 3,
          data: instanceAttributes.offset,
        },
        random: {
          instanced: 1,
          size: 3,
          data: instanceAttributes.random,
        },
      },
    ] as const;
  });

  const sceneAssets = createMemo(() => {
    const loadedGeometry = geometryArgs();
    const loadedImage = image();

    if (!loadedGeometry || !loadedImage) {
      return undefined;
    }

    return {
      geometry: loadedGeometry,
      image: loadedImage,
    };
  });

  const rotation = createMemo<[number, number, number]>(() => [
    0,
    -time() * 0.3,
    0,
  ]);

  return (
    <>
      <Camera
        makeDefault={props.makeDefault}
        fov={15}
        position={[0, 0, 15]}
        lookAt={[0, 0, 0]}
      />

      <Show when={sceneAssets()} keyed>
        {(assets) => (
          <Mesh rotation={rotation()}>
            <Geometry args={assets.geometry} />
            <Program
              ref={(instance) => {
                createEffect(() => {
                  instance.uniforms.uTime.value = time();
                });
              }}
              args={[
                {
                  vertex: instancingVertex,
                  fragment: instancingFragment,
                  uniforms: {
                    uTime: { value: 0 },
                    tMap: { value: null },
                  },
                },
              ]}>
              <Texture attach="uniforms.tMap.value" image={assets.image} />
            </Program>
          </Mesh>
        )}
      </Show>
    </>
  );
}
