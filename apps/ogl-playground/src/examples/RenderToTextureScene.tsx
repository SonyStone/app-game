import {
  Box,
  Camera,
  Mesh,
  Program,
  RenderTarget,
  Texture,
  useOgl,
  useTime,
} from '@work-ilyas/solid-ogl';
import { createEffect, createSignal } from 'solid-js';
import type {
  Camera as OglCamera,
  Mesh as OglMesh,
  RenderTarget as OglRenderTarget,
  Texture as OglTexture,
} from 'ogl';
import type { CameraSceneProps } from './types';

const texturedVertex = /* glsl */ `
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec2 uv;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform mat3 normalMatrix;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const texturedFragment = /* glsl */ `
  precision highp float;

  uniform sampler2D tMap;

  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vec3 normal = normalize(vNormal);
    float lighting = 0.2 * dot(normal, normalize(vec3(-0.3, 0.8, 0.6)));
    vec3 tex = texture2D(tMap, vUv).rgb;
    gl_FragColor.rgb = tex + lighting + vec3(vUv - 0.5, 0.0) * 0.1;
    gl_FragColor.a = 1.0;
  }
`;

const dataTexture = new Uint8Array([
  191, 25, 54, 255, 96, 18, 54, 255, 96, 18, 54, 255, 37, 13, 53, 255,
]);

type TexturedProgramLike = {
  uniforms: {
    tMap: { value: unknown };
  };
};

export function RenderToTextureScene(props: CameraSceneProps) {
  const ogl = useOgl();
  const time = useTime();
  const [sourceCamera, setSourceCamera] = createSignal<OglCamera>();
  const [sourceMesh, setSourceMesh] = createSignal<OglMesh>();
  const [displayMesh, setDisplayMesh] = createSignal<OglMesh>();
  const [target, setTarget] = createSignal<OglRenderTarget>();
  const [texture, setTexture] = createSignal<OglTexture>();
  let sourceProgramRef: TexturedProgramLike | undefined;
  let displayProgramRef: TexturedProgramLike | undefined;

  createEffect(() => {
    const baseTexture = texture();
    const renderTarget = target();

    if (baseTexture && sourceProgramRef) {
      sourceProgramRef.uniforms.tMap.value = baseTexture;
    }

    if (renderTarget && displayProgramRef) {
      displayProgramRef.uniforms.tMap.value = renderTarget.texture;
    }
  });

  createEffect(() => {
    const elapsed = time();
    const offscreenMesh = sourceMesh();
    const visibleMesh = displayMesh();

    if (offscreenMesh) {
      offscreenMesh.rotation.y = -elapsed * 1.1;
    }

    if (visibleMesh) {
      visibleMesh.rotation.y = -elapsed * 0.3;
      visibleMesh.rotation.x = -elapsed * 0.55;
    }

    const offscreenCamera = sourceCamera();
    const renderTarget = target();

    if (!offscreenMesh || !offscreenCamera || !renderTarget) {
      return;
    }

    offscreenMesh.visible = true;
    ogl.renderer.render({
      scene: offscreenMesh,
      camera: offscreenCamera,
      target: renderTarget,
    });
    offscreenMesh.visible = false;
  });

  return (
    <>
      <RenderTarget
        ref={(instance) => {
          setTarget(instance as unknown as OglRenderTarget);
        }}
        args={[
          {
            width: 512,
            height: 512,
          },
        ]}
      />
      <Texture
        ref={(instance) => {
          setTexture(instance as unknown as OglTexture);
        }}
        args={[
          {
            image: dataTexture,
            width: 2,
            height: 2,
            magFilter: ogl.gl.NEAREST,
            minFilter: ogl.gl.NEAREST,
            generateMipmaps: false,
          },
        ]}
      />

      <Camera
        ref={(instance) => {
          setSourceCamera(instance as unknown as OglCamera);
        }}
        position={[0, 1, 5]}
        lookAt={[0, 0, 0]}
      />
      <Mesh
        ref={(instance) => {
          setSourceMesh(instance as unknown as OglMesh);
        }}
        visible={false}>
        <Box />
        <Program
          ref={(instance) => {
            sourceProgramRef = instance as unknown as TexturedProgramLike;
          }}
          args={[
            {
              vertex: texturedVertex,
              fragment: texturedFragment,
              uniforms: {
                tMap: { value: null },
              },
            },
          ]}
        />
      </Mesh>

      <Camera
        makeDefault={props.makeDefault}
        position={[0, 1, 5]}
        lookAt={[0, 0, 0]}
      />
      <Mesh
        ref={(instance) => {
          setDisplayMesh(instance as unknown as OglMesh);
        }}>
        <Box />
        <Program
          ref={(instance) => {
            displayProgramRef = instance as unknown as TexturedProgramLike;
          }}
          args={[
            {
              vertex: texturedVertex,
              fragment: texturedFragment,
              uniforms: {
                tMap: { value: null },
              },
            },
          ]}
        />
      </Mesh>
    </>
  );
}
