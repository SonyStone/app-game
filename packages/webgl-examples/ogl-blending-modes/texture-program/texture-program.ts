import { OGLRenderingContext, Program } from '@app-game/ogl';
import { ProgramOptions } from '@app-game/ogl/core/program';
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
