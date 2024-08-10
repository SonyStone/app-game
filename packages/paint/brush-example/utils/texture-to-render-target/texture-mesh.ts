import { Mesh, OGLRenderingContext, Program, RenderTarget, Texture } from '@packages/ogl';
import { Square } from '@packages/ogl/extras/square';

import fragment from './texture-mesh.frag?raw';
import vertex from './texture-mesh.vert?raw';

export class TextureMesh extends Mesh {
  private readonly tMap: { value: Texture | undefined };

  constructor(gl: OGLRenderingContext, props: { texture: Texture | undefined }) {
    const tMap = { value: props.texture };

    const geometry = new Square(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        tMap
      },
      transparent: false
    });
    super(gl, {
      geometry,
      program
    });

    this.tMap = tMap;
  }

  setMap(value: Texture | undefined) {
    this.tMap.value = value;
  }

  render(target?: RenderTarget) {
    this.gl.renderer.render({
      scene: this,
      target,
      clear: true
    });
  }
}
