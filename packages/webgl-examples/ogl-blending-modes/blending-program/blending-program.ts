import { OGLRenderingContext, Program, Vec3 } from '@packages/ogl';
import { BlendFunc } from '@packages/ogl/core/renderer';
import fragment from './blending-program.frag?raw';
import vertex from './blending-program.vert?raw';

export function blendingProgram(props: { gl: OGLRenderingContext; blendFunc?: BlendFunc }) {
  const { gl, blendFunc } = props;

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      u_color: { value: new Vec3(1, 1, 1) }
    },
    cullFace: false,
    depthTest: false,
    transparent: true,
    blendFunc
  });

  return program;
}
