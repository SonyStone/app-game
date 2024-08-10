import { Mesh, OGLRenderingContext, Program, Texture } from '@packages/ogl';
import { RenderTarget } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { BlendModes, ColorBlendModes } from '../blend-modes';
import fragment from './blend.frag?raw';
import vertex from './blend.vert?raw';

export class BlendMesh extends Mesh {
  constructor(gl: OGLRenderingContext) {
    super(gl, {
      geometry: new Square(gl),
      program: new Program(gl, {
        vertex,
        fragment,
        uniforms: {
          tMap1: { value: undefined },
          tMap2: { value: undefined },
          blendMode: { value: BlendModes.NORMAL },
          colorBlendMode: { value: ColorBlendModes.USING_GAMMA },
          uOpacity: { value: 1.0 }
        },
        transparent: false
      })
    });
  }

  setColorBlendMode(value: ColorBlendModes) {
    this.program.uniforms.colorBlendMode.value = value;
  }

  setBlendMode(value: BlendModes) {
    this.program.uniforms.blendMode.value = value;
  }

  setOpacity(value: number) {
    this.program.uniforms.uOpacity.value = value;
  }

  setTexture1(value?: Texture) {
    this.program.uniforms.tMap1.value = value;
  }

  setTexture2(value?: Texture) {
    this.program.uniforms.tMap2.value = value;
  }

  render(target?: RenderTarget) {
    this.gl.renderer.render({
      scene: this,
      target,
      clear: true
    });
  }
}
