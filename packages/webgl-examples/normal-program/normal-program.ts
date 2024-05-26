import { AttributesParams, UniformsParams, createProgram } from '@packages/webgl/webgl-objects/program';
import type { WebGLRenderingContextStrict } from '@packages/webgl/webgl-strict-types/webgl';
import fragment from './normal-program.frag?raw';
import vertex from './normal-program.vert?raw';

/**
 * A normal program.
 */
export const normalProgram = {
  vert: vertex,
  frag: fragment,
  attributes: (attribute: AttributesParams) => ({
    position: attribute.name('position').location,
    normal: attribute.name('normal').location
  }),
  uniforms: (uniform: UniformsParams) => ({
    normalMatrix: uniform.name('normalMatrix').mat4(),
    modelViewMatrix: uniform.name('modelViewMatrix').mat4(),
    projectionMatrix: uniform.name('projectionMatrix').mat4()
  })
};

/**
 * A normal program.
 */
export function createNormalProgram(gl: WebGLRenderingContextStrict) {
  const program = createProgram(gl, normalProgram);

  return program;
}
