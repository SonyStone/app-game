import type { WebGLRenderingContextStrict } from '../webgl-strict-types/webgl';

import { createBuffer } from './buffer';
import { ProgramParams, createProgram } from './program';
import { createVertexArray } from './vertex-array-object';

export function createWebGL2Context(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2')! as WebGL2RenderingContext;

  if (!gl) {
    throw new Error('no webgl2 context');
  }

  return gl;
}

export function createWebGL2Renderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2')! as WebGL2RenderingContext;

  if (!gl) {
    throw new Error('no webgl2 context');
  }

  return {
    canvas: canvas,
    context: gl,
    /** WebGLBuffer */
    createBuffer(params: {
      target: WebGLRenderingContextStrict.BufferTarget;
      usage: WebGLRenderingContextStrict.BufferDataUsage;
    }) {
      return createBuffer(gl, params);
    },
    /** WebGLFramebuffer */
    createFramebuffer() {
      // todo
    },
    /** WebGLProgram  */
    createProgram<U, A>(params: ProgramParams<U, A>) {
      return createProgram<U, A>(gl, params);
    },
    /** WebGLRenderbuffer */
    createRenderbuffer() {
      // todo
    },
    /** WebGLShader */
    createShader() {
      // todo
    },
    /** WebGLTexture */
    createTexture() {
      // todo
    },
    /** WebGLQuery */
    createQuery() {
      // todo
    },
    /** WebGLSampler */
    createSampler() {
      // todo
    },
    /** WebGLSync */
    createSync() {
      // todo
    },
    /** WebGLTransformFeedback */
    createTransformFeedback() {
      // todo
    },
    /** WebGLVertexArrayObject */
    createVertexArray() {
      return createVertexArray(gl);
    },
    viewport() {
      gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    },
    clear() {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    },
    draw: {
      triangles(count: number) {
        gl.drawArrays(gl.TRIANGLES, 0, count);
      }
    }
  };
}
