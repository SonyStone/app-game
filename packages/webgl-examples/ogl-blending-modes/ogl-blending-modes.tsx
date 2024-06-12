import { GridHelperComponent } from '@packages/math-examples/grid-helper.component';
import { Camera, Orbit, Renderer, Texture, Transform, Vec3 } from '@packages/ogl';
import { BLENDING_FACTOR } from '@packages/webgl/static-variables';
import { createWindowSize } from '@solid-primitives/resize-observer';
import { For } from 'solid-js';
import { effect } from 'solid-js/web';
import { PlaneComponent } from './plane.component';

import { TextureProgram } from './texture-program/texture-program';
import fabric_pattern_07_col_1_1k from './textures/fabric_pattern_07_col_1_1k.png?url';
import large_red_bricks_diff_1k from './textures/large_red_bricks_diff_1k.jpg?url';

import createRAF from '@solid-primitives/raf';
import { blendingProgram } from './blending-program/blending-program';

/**
 * lets see all webgl blending modes
 */
export default function OglBlendingModes() {
  const canvas = (<canvas />) as HTMLCanvasElement;

  const renderer = new Renderer({ dpr: 2, canvas });
  const gl = renderer.gl;
  const camera = new Camera({ fov: 15 });
  camera.position.set(8, 12, 24);

  const controls = new Orbit(camera, {
    target: new Vec3(2.5, -2.5, 0)
  });

  const size = createWindowSize();

  effect(() => {
    renderer.setSize(size.width, size.height);
    camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
  });

  const scene = new Transform();

  gl.clearColor(0.9, 0.9, 0.9, 1);

  // renderer.enable(GL_CAPABILITIES.BLEND);

  const largeRedBricks = (() => {
    const texture = new Texture(gl);
    const img = new Image();
    img.src = large_red_bricks_diff_1k;
    img.onload = () => (texture.image = img);
    return texture;
  })();

  const fabricPattern = (() => {
    const texture = new Texture(gl);
    const img = new Image();
    img.src = fabric_pattern_07_col_1_1k;
    img.onload = () => (texture.image = img);
    return texture;
  })();

  const program = (() => {
    const program = new TextureProgram(gl, {
      uniforms: {
        tMap: { value: largeRedBricks },
        tMap2: { value: fabricPattern },
        opacity: { value: 0.5 },
        u_time: { value: 0 }
      }
    });

    return program;
  })();

  const [, start, stop] = createRAF((t: number) => {
    controls.update();
    program.uniforms.u_time.value = t * 0.001;
    renderer.render({ scene, camera });
  });
  start();

  const blendsFactorsX = [
    BLENDING_FACTOR.ZERO,
    BLENDING_FACTOR.ONE,
    BLENDING_FACTOR.DST_COLOR,
    BLENDING_FACTOR.ONE_MINUS_DST_COLOR,
    BLENDING_FACTOR.SRC_ALPHA,
    BLENDING_FACTOR.ONE_MINUS_SRC_ALPHA
  ];

  const blendsFactorsY = [
    BLENDING_FACTOR.ZERO,
    BLENDING_FACTOR.ONE,
    BLENDING_FACTOR.SRC_COLOR,
    BLENDING_FACTOR.ONE_MINUS_SRC_COLOR,
    BLENDING_FACTOR.SRC_ALPHA,
    BLENDING_FACTOR.ONE_MINUS_SRC_ALPHA
  ];

  const blendsFactorsXY = blendsFactorsY
    .map((itemY, indexY) =>
      blendsFactorsX.map((itemX, indexX) => ({
        x: indexX,
        y: indexY * -1,
        blendFunc: { src: itemX, dst: itemY }
      }))
    )
    .flat();

  return (
    <>
      {canvas}
      <For each={blendsFactorsXY}>
        {(item) => (
          <>
            <PlaneComponent
              gl={gl}
              parent={scene}
              position={[item.x, item.y, 0.1]}
              program={blendingProgram({ gl, blendFunc: item.blendFunc })}
              blendFunc={item.blendFunc}
            />
            <PlaneComponent gl={gl} parent={scene} position={[item.x, item.y, 0]} program={program} />
          </>
        )}
      </For>
      <GridHelperComponent gl={gl} scene={scene} />
    </>
  );
}
