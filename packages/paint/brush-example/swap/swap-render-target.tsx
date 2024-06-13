import { FVec2 } from '@packages/math';
import { Mesh, OGLRenderingContext, Program, RenderTarget, Triangle, createSwapBuffering } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { createTimer } from '@packages/utils/timeout';
import { createTexture4colors } from '@packages/webgl-examples/ogl-model-viewer/texture-4-colors';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { BlendModes } from '../blend-modes';
import { curve } from '../utils/curve';
import { loadTextureAsync } from '../utils/load-texture';
import large_red_bricks_diff_1k from './large_red_bricks_diff_1k.jpg?url';
import fragment from './swap-texture.frag?raw';
import vertex from './swap-texture.vert?raw';

export const createSwapRenderTarget = ({
  gl,
  options = {
    width: 1024,
    height: 1024,
    type: GL_DATA_TYPE.HALF_FLOAT,
    format: gl.RGBA,
    internalFormat: gl.RGBA16F,
    depth: false
  }
}: {
  gl: OGLRenderingContext;
  options?: Partial<RenderTargetOptions>;
}) => {
  const timeout = createTimer();
  const outputTexture = { value: createTexture4colors(gl) };

  const buffers = createSwapBuffering({
    gl,
    options: options
  });
  const layer = new RenderTarget(gl, options);

  (async () => {
    const texture = await loadTextureAsync(gl, large_red_bricks_diff_1k);

    outputTexture.value = texture; // set loaded texture

    const renderTextureUniform = { value: texture }; // set loaded texture

    const blendMode = { value: BlendModes.NORMAL };
    const opacity = { value: 0.1 };
    const geometry = new Triangle(gl);
    const mouse = new FVec2();
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: { tMap: renderTextureUniform, uMouse: { value: mouse }, blendMode, uOpacity: opacity }
    });
    const mesh = new Mesh(gl, { geometry, program });

    const points = [
      [
        [0.1, 0.1],
        [0.1, 0.8],
        [0.2, 0.9],
        [0.9, 0.9]
      ],
      [
        [0.2, 0.1],
        [0.2, 0.7],
        [0.3, 0.8],
        [0.9, 0.8]
      ],
      [
        [0.3, 0.1],
        [0.3, 0.6],
        [0.4, 0.7],
        [0.9, 0.7]
      ]
    ];

    // gl.enable(gl.BLEND);

    gl.renderer.render({
      scene: mesh,
      target: layer,
      clear: false
    });
    await timeout(100);
    // renderTextureUniform.value = buffers.swap();

    // outputTexture.value = buffers.read.texture;

    for (let i = 0; i <= 1; i = i + 0.05) {
      mouse.copy(curve(i, points[0][0], points[0][1], points[0][2], points[0][3]));
      await timeout(20);

      blendMode.value = BlendModes.SCREEN;
      opacity.value = i;
      gl.renderer.render({
        scene: mesh,
        target: buffers.write,
        clear: false
      });
      gl.renderer.render({
        scene: mesh,
        target: layer,
        clear: false
      });
      renderTextureUniform.value = buffers.swap();
      outputTexture.value = renderTextureUniform.value;
    }

    for (let i = 0; i <= 1; i = i + 0.05) {
      mouse.copy(curve(i, points[1][0], points[1][1], points[1][2], points[1][3]));
      await timeout(20);

      blendMode.value = BlendModes.OVERLAY;
      opacity.value = i;
      gl.renderer.render({
        scene: mesh,
        target: buffers.write,
        clear: false
      });
      gl.renderer.render({
        scene: mesh,
        target: layer,
        clear: false
      });
      renderTextureUniform.value = buffers.swap();
      outputTexture.value = renderTextureUniform.value;
    }

    for (let i = 0; i <= 1; i = i + 0.05) {
      mouse.copy(curve(i, points[2][0], points[2][1], points[2][2], points[2][3]));
      await timeout(20);

      blendMode.value = BlendModes.NORMAL;
      opacity.value = i;
      gl.renderer.render({
        scene: mesh,
        target: buffers.write,
        clear: false
      });
      gl.renderer.render({
        scene: mesh,
        target: layer,
        clear: false
      });
      renderTextureUniform.value = buffers.swap();
      outputTexture.value = renderTextureUniform.value;
    }

    await timeout(100);

    blendMode.value = BlendModes.MULTIPLY;
    opacity.value = 0.0;
    gl.renderer.render({
      scene: mesh,
      target: layer,
      clear: false
    });
  })();

  return layer;
};
