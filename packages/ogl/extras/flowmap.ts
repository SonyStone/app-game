import { Mesh } from '../core/mesh';
import { Program } from '../core/program';
import { RenderTarget } from '../core/render-target';
import { Triangle } from './triangle';

import { FVec2 } from '@packages/math';
import { OGLRenderingContext } from '../core/renderer';
import { Texture } from '../core/texture';
import fragment from './flowmap.frag?raw';
import vertex from './flowmap.vert?raw';

export interface FlowmapOptions {
  size: number;
  falloff: number;
  alpha: number;
  dissipation: number;
  type: number;
}

interface SwapMask {
  read: RenderTarget;
  write: RenderTarget;
  swap(): void;
}

export class Flowmap {
  // output uniform containing render target textures
  uniform: { value: Texture } = { value: null as any };

  mask: SwapMask;

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
      dissipation = 0.98, // affects the speed that the stamp fades. Closer to 1 is slower
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
    this.mask.swap();
  }
}

function initProgram({
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
}) {
  return new Mesh(gl, {
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
}

function createFBOs({
  gl,
  type,
  size,
  uniform
}: {
  gl: OGLRenderingContext;
  type?: number;
  size: number;
  uniform: { value: Texture };
}) {
  // Requested type not supported, fall back to half float
  if (!type) {
    type = (gl as WebGL2RenderingContext).HALF_FLOAT || gl.renderer.extensions['OES_texture_half_float'].HALF_FLOAT_OES;
  }

  let minFilter = (() => {
    return gl.LINEAR;
  })();

  const options = {
    width: size,
    height: size,
    type,
    format: gl.RGBA,
    internalFormat: type === gl.FLOAT ? (gl as WebGL2RenderingContext).RGBA32F : (gl as WebGL2RenderingContext).RGBA16F,

    minFilter,
    depth: false
  };

  const mask = {
    read: new RenderTarget(gl, options),
    write: new RenderTarget(gl, options),

    // Helper function to ping pong the render targets and update the uniform
    swap: () => {
      let temp = mask.read;
      mask.read = mask.write;
      mask.write = temp;
      uniform.value = mask.read.texture;
    }
  };

  mask.swap();

  return mask;
}
