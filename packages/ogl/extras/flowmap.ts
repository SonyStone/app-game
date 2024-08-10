import { Mesh } from '../core/mesh';
import { Program } from '../core/program';
import { Triangle } from './triangle';

import { FVec2 } from '@packages/math';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables/data-type';
import { OGLRenderingContext } from '../core/renderer';
import { Texture } from '../core/texture';
import fragment from './flowmap.frag?raw';
import vertex from './flowmap.vert?raw';
import { SwapBuffering } from './swap-buffering';

export interface FlowmapOptions {
  size: number;
  falloff: number;
  alpha: number;
  dissipation: number;
  type: number;
}

export class Flowmap {
  // output uniform containing render target textures
  uniform: { value: Texture } = { value: null as any };

  mask: SwapBuffering;

  aspect = 1;
  mouse = new FVec2();
  velocity = new FVec2();

  mesh: Mesh;

  constructor(
    readonly gl: OGLRenderingContext,
    {
      size = 128, // default size of the render targets
      falloff = 0.3, // size of the stamp, percentage of the size
      alpha = 1, // opacity of the stamp
      dissipation = 1, // affects the speed that the stamp fades. Closer to 1 is slower
      type // Pass in gl.FLOAT to force it, defaults to gl.HALF_FLOAT
    }: Partial<FlowmapOptions> = {}
  ) {
    this.mask = createFBOs({
      gl,
      size,
      type,
      uniform: this.uniform
    });

    this.mesh = initProgram({
      gl,
      uniform: this.uniform,
      falloff,
      alpha,
      dissipation,
      mouse: this.mouse,
      velocity: this.velocity
    });
  }

  update() {
    this.mesh.program.uniforms.uAspect.value = this.aspect;

    this.gl.renderer.render({
      scene: this.mesh,
      target: this.mask.write,
      clear: false
    });
    this.uniform.value = this.mask.swap();
  }
}

const initProgram = ({
  gl,
  uniform,
  falloff,
  alpha,
  dissipation,
  mouse,
  velocity
}: {
  gl: OGLRenderingContext;
  uniform: { value: Texture };
  falloff: number;
  alpha: number;
  dissipation: number;
  mouse: FVec2;
  velocity: FVec2;
}) =>
  new Mesh(gl, {
    // Triangle that includes -1 to 1 range for 'position', and 0 to 1 range for 'uv'.
    geometry: new Triangle(gl),

    program: new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        tMap: uniform,

        uFalloff: { value: falloff * 0.5 },
        uAlpha: { value: alpha },
        uDissipation: { value: dissipation },

        // User needs to update these
        uAspect: { value: 1 },
        uMouse: { value: mouse },
        uVelocity: { value: velocity }
      },
      depthTest: false
    })
  });

/**
 * Frame Buffer Objects (FBOs)
 * @param param0
 * @returns
 */
const createFBOs = ({
  gl,
  type,
  size,
  uniform
}: {
  gl: OGLRenderingContext;
  type?: GL_DATA_TYPE;
  size: number;
  uniform: { value: Texture };
}) => {
  // Requested type not supported, fall back to half float
  if (!type) {
    type = GL_DATA_TYPE.HALF_FLOAT || gl.renderer.extensions['OES_texture_half_float'].HALF_FLOAT_OES;
  }

  let minFilter = (() => {
    return gl.LINEAR;
  })();

  const options = {
    width: size,
    height: size,
    type,
    format: gl.RGBA,
    internalFormat:
      type === GL_DATA_TYPE.FLOAT ? (gl as WebGL2RenderingContext).RGBA32F : (gl as WebGL2RenderingContext).RGBA16F,

    minFilter,
    depth: false
  };

  const mask = new SwapBuffering(gl, options);

  uniform.value = mask.swap();

  return mask;
};
