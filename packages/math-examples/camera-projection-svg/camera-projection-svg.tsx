import { Camera, Mat4, Orbit, Transform, Vec3, Vec4 } from '@packages/ogl';
import { Vec4Tuple } from '@packages/ogl/math/vec-4';
import { validate } from '@packages/utils/validate';
import { createEmitter } from '@solid-primitives/event-bus';
import createRAF from '@solid-primitives/raf';
import { onMount } from 'solid-js';
import { Cube } from './cube';
import { Grid } from './grid';
import { OnScreenCube } from './on-screen-cube';
import { SvgPath } from './svg-path';

export default function CameraProjectionSVG() {
  let svg: SVGSVGElement;

  const camera = new Camera({ fov: 35, aspect: 400 / 400 });
  camera.position.set(2, 4, 4);
  const scene = new Transform();

  let transformMatrix = new Mat4();
  const worldSpaceToScreenSpace = (point: Vec4Tuple) => {
    if (point[3] === undefined) {
      point[3] = 1;
    }
    const clipSpaceVertex = transformMatrix.multiplyVec4(point, new Vec4());
    clipSpaceVertex.multiply(1 / clipSpaceVertex[3]);

    return validate(clipSpaceVertex);
  };

  const screenSpaceToWorldSpace = (clipCoords: Vec4Tuple) => {
    if (clipCoords[3] === undefined) {
      clipCoords[3] = 1;
    }
    const inverseTransformMatrix = new Mat4().copy(transformMatrix).inverse();

    const worldSpaceVertex = inverseTransformMatrix.multiplyVec4(clipCoords, new Vec4());
    worldSpaceVertex.multiply(1 / worldSpaceVertex[3]);
    return validate(worldSpaceVertex);
  };

  const { listen, emit } = createEmitter();

  onMount(() => {
    const controls = new Orbit(camera, { element: svg as any as HTMLElement, target: new Vec3(1, 1, 0) });

    function update(t: number) {
      controls.update();
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();

      // projectionMatrix * viewMatrix * worldMatrix * position
      {
        transformMatrix = new Mat4();
        transformMatrix.multiply(camera.viewMatrix, scene.worldMatrix);
        transformMatrix.multiply(camera.projectionMatrix, transformMatrix);
      }
      emit();
    }

    const [running, start, stop] = createRAF(update);
    start();
  });

  return (
    <div>
      <div>Camera Projection on SVG canvas</div>
      <svg
        class="h-full w-full touch-none select-none border"
        ref={(ref) => (svg = ref)}
        height={400}
        width={400}
        viewBox="0 0 2 2"
      >
        <g transform="scale(1, -1) translate(1 1)" transform-origin="center">
          <OnScreenCube
            camera={camera}
            screenSpaceToWorldSpace={screenSpaceToWorldSpace}
            worldSpaceToScreenSpace={worldSpaceToScreenSpace}
            update={listen}
          />
          <SvgPath
            position={[-1, -1, -1]}
            path="M11.9994 3V7M11.9994 7V17M11.9994 7L8.99943 4M11.9994 7L14.9994 4M11.9994 17V21M11.9994 17L8.99943 20M11.9994 17L14.9994 20M4.20624 7.49999L7.67034 9.49999M7.67034 9.49999L16.3306 14.5M7.67034 9.49999L3.57227 10.5981M7.67034 9.49999L6.57227 5.40191M16.3306 14.5L19.7947 16.5M16.3306 14.5L17.4287 18.5981M16.3306 14.5L20.4287 13.4019M4.2067 16.5L7.6708 14.5M7.6708 14.5L16.3311 9.49999M7.6708 14.5L3.57273 13.4019M7.6708 14.5L6.57273 18.5981M16.3311 9.49999L19.7952 7.49999M16.3311 9.49999L17.4291 5.40192M16.3311 9.49999L20.4291 10.5981"
            worldSpaceToScreenSpace={worldSpaceToScreenSpace}
            update={listen}
          />
          {/* <SvgPath
            path="M 10,30 A 20,20 0,0,1 50,30 A 20,20 0,0,1 90,30 Q 90,60 50,90 Q 10,60 10,30 z"
            worldSpaceToScreenSpace={worldSpaceToScreenSpace}
            update={listen}
          /> */}
          <Cube worldSpaceToScreenSpace={worldSpaceToScreenSpace} update={listen} />
          {/* <Intersection
            camera={camera}
            screenSpaceToWorldSpace={screenSpaceToWorldSpace}
            worldSpaceToScreenSpace={worldSpaceToScreenSpace}
            update={listen}
          /> */}
          <Grid worldSpaceToScreenSpace={worldSpaceToScreenSpace} update={listen} />
        </g>
      </svg>
    </div>
  );
}
