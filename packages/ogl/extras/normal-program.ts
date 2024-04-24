import { Program } from '../core/program';

import fragment from './normal-program.frag?raw';
import vertex from './normal-program.vert?raw';

import type { ProgramOptions } from '../core/program';
import type { OGLRenderingContext } from '../core/renderer';

/**
 * A normal program.
 */
export class NormalProgram extends Program {
  constructor(gl: OGLRenderingContext, options?: Partial<Omit<ProgramOptions, 'vertex' | 'fragment' | 'cullFace'>>) {
    super(gl, {
      ...options,
      vertex: vertex,
      fragment: fragment,
      cullFace: false
    });
  }
}
