import { Program } from '../core/program';

import fragment from './texture-program.frag?raw';
import vertex from './texture-program.vert?raw';

import type { ProgramOptions } from '../core/program';
import type { OGLRenderingContext } from '../core/renderer';

/**
 * A texture program.
 */
export class TextureProgram extends Program {
  constructor(gl: OGLRenderingContext, options?: Partial<Omit<ProgramOptions, 'vertex' | 'fragment' | 'cullFace'>>) {
    super(gl, {
      ...options,
      vertex: vertex,
      fragment: fragment,
      cullFace: false
    });
  }
}
