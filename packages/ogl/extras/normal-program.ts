import { Program } from '../core/program';

import fragment from './normal-program.frag';
import vertex from './normal-program.vert';

import type { ProgramOptions } from '../core/program';
import type { OGLRenderingContext } from '../core/renderer';

/**
 * A normal program.
 * @see {@link https://github.com/oframe/ogl/blob/master/src/extras/NormalProgram.js | Source}
 */
export function NormalProgram(
  gl: OGLRenderingContext,
  options?: Partial<Omit<ProgramOptions, 'vertex' | 'fragment' | 'cullFace'>>
) {
  return new Program(gl, {
    ...options,
    vertex: vertex,
    fragment: fragment,
    cullFace: false
  });
}
