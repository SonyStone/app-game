import { Mesh, OGLRenderingContext, Program, RenderTarget, Texture } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { Accessor, createEffect } from 'solid-js';
import { curve } from '../utils/curve';
import fragment from './brush-instancing.frag?raw';
import vertex from './brush-instancing.vert?raw';

export const createBrushInstancingRenderTarget = ({
  gl,
  texture,
  instancedCount = 300,
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
  texture?: Texture;
  instancedCount?: number | Accessor<number | undefined>;
  options?: Partial<RenderTargetOptions>;
}) => {
  const layer = new RenderTarget(gl, options);

  {
    const points = [
      [0.1, 0.1],
      [0.1, 0.8],
      [0.2, 0.9],
      [0.9, 0.9]
    ];

    createEffect(() => {
      const num = (typeof instancedCount === 'function' ? instancedCount() : instancedCount) ?? 300;
      const offset = new Float32Array(
        (() => {
          const a = [];
          let step = 1 / num;
          let i = 0;
          for (let p = 0; p <= 1; p = p + step, i++) {
            a.push(...curve(p, points[0], points[1], points[2], points[3]));
          }
          return a;
        })()
      );

      const geometry = new Square(gl, {
        attributes: {
          offset: { instanced: 1, size: 2, data: offset }
        }
      });
      // geometry.instancedCount = 300;
      const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: { tBrush: { value: texture } },
        transparent: true,
        blendFunc: {
          src: gl.SRC_ALPHA,
          dst: gl.ONE_MINUS_SRC_ALPHA,
          srcAlpha: gl.ONE,
          dstAlpha: gl.ONE_MINUS_SRC_ALPHA
        }
      });
      const mesh = new Mesh(gl, { geometry, program });
      gl.clearColor(0.27, 0.66, 0.93, 0);
      gl.renderer.render({
        scene: mesh,
        target: layer,
        clear: true
      });
    });
  }

  return layer;
};
