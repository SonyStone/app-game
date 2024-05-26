import { OGLRenderingContext, Program } from '@packages/ogl';
import { ProgramOptions } from '@packages/ogl/core/program';
import fragment from './texture-program.frag?raw';
import vertex from './texture-program.vert?raw';

/**
 * A texture program.
 */
export class TextureProgram extends Program {
  constructor(gl: OGLRenderingContext, options?: Partial<Omit<ProgramOptions, 'vertex' | 'fragment' | 'cullFace'>>) {
    super(gl, {
      ...options,
      vertex: vertex,
      fragment: fragment,
      cullFace: false,
      uniforms: {
        opacity: { value: 0.1 },
        ...options?.uniforms
      }
    });
  }
}
