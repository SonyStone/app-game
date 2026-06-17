import { Camera, Polyline, useTime } from '@work-ilyas/solid-ogl';
import { createEffect } from 'solid-js';
import { Color, Vec3, type Polyline as OglPolyline } from 'ogl';
import type { CameraSceneProps } from './types';

const polylineVertex = /* glsl */ `
  precision highp float;

  attribute vec3 position;
  attribute vec3 next;
  attribute vec3 prev;
  attribute vec2 uv;
  attribute float side;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform vec2 uResolution;
  uniform float uDPR;
  uniform float uThickness;

  varying vec2 vUv;

  vec4 getPosition() {
    vec4 current = vec4(position, 1.0);

    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 nextScreen = next.xy * aspect;
    vec2 prevScreen = prev.xy * aspect;
    vec2 tangent = normalize(nextScreen - prevScreen);
    vec2 normal = vec2(-tangent.y, tangent.x);
    normal /= aspect;
    normal *= mix(1.0, 0.1, pow(abs(uv.y - 0.5) * 2.0, 2.0));

    float dist = length(nextScreen - prevScreen);
    normal *= smoothstep(0.0, 0.02, dist);

    float pixelWidthRatio = 1.0 / (uResolution.y / uDPR);
    float pixelWidth = current.w * pixelWidthRatio;
    normal *= pixelWidth * uThickness;
    current.xy -= normal * side;

    return current;
  }

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * getPosition();
  }
`;

const polylineFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;

  varying vec2 vUv;

  void main() {
    float fade = smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.85, 1.0, vUv.y));
    gl_FragColor = vec4(uColor * (0.7 + fade * 0.5), 1.0);
  }
`;

type LineState = {
  color: string;
  thickness: number;
  offset: number;
  phase: number;
  speed: number;
  points: Vec3[];
  polyline?: OglPolyline;
};

function createLines() {
  return [
    { color: '#e09f7d', thickness: 28, offset: -1.2, phase: 0.0, speed: 1.0 },
    { color: '#ef5d60', thickness: 24, offset: -0.55, phase: 0.8, speed: 1.2 },
    { color: '#ec4067', thickness: 20, offset: 0.0, phase: 1.6, speed: 1.4 },
    { color: '#a01a7d', thickness: 26, offset: 0.55, phase: 2.2, speed: 1.1 },
    { color: '#311847', thickness: 32, offset: 1.2, phase: 3.0, speed: 0.9 },
  ].map<LineState>((line) => ({
    ...line,
    points: Array.from({ length: 20 }, () => new Vec3()),
  }));
}

export function PolylinesScene(props: CameraSceneProps) {
  const time = useTime();
  const lines = createLines();

  createEffect(() => {
    const elapsed = time();

    for (const line of lines) {
      const lastIndex = line.points.length - 1;

      for (let index = 0; index <= lastIndex; index += 1) {
        const point = line.points[index];
        const alpha = index / lastIndex;
        point.x = alpha * 5 - 2.5;
        point.y =
          line.offset +
          Math.sin(elapsed * line.speed + alpha * 5.5 + line.phase) * 0.42 +
          Math.cos(elapsed * 0.7 + alpha * 8.0 + line.phase) * 0.12;
        point.z = Math.cos(elapsed * 0.5 + alpha * 4.5 + line.phase) * 0.35;
      }

      line.polyline?.updateGeometry();
      line.polyline?.resize();
    }
  });

  return (
    <>
      <Camera
        makeDefault={props.makeDefault}
        position={[0, 0, 6]}
        lookAt={[0, 0, 0]}
      />

      {lines.map((line) => (
        <Polyline
          ref={(instance) => {
            const polyline = instance as unknown as OglPolyline;
            polyline.mesh.frustumCulled = false;
            line.polyline = polyline;
          }}
          args={[
            {
              points: line.points,
              vertex: polylineVertex,
              fragment: polylineFragment,
              uniforms: {
                uColor: { value: new Color(line.color) },
                uThickness: { value: line.thickness },
              },
            },
          ]}
        />
      ))}
    </>
  );
}
