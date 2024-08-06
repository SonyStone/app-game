import { Mesh, OGLRenderingContext, Program, RenderTarget } from '@packages/ogl';
import { Square } from '@packages/ogl/extras/square';
import fragment from './brush-texture.frag?raw';
import vertex from './brush-texture.vert?raw';

export class BrushMesh extends Mesh {
  private readonly uColor: { value: [number, number, number] };

  constructor(gl: OGLRenderingContext) {
    const uColor = { value: [0, 0, 0] as [number, number, number] };
    super(gl, {
      geometry: new Square(gl),
      program: new Program(gl, {
        vertex,
        fragment,
        uniforms: { uColor }
      })
    });

    this.uColor = uColor;
  }

  setColor(value?: [number, number, number]) {
    if (value) {
      this.uColor.value = value;
    }
  }

  render(target?: RenderTarget) {
    this.gl.renderer.clearColor({ target, color: this.uColor.value });
    this.gl.renderer.render({
      scene: this,
      target,
      clear: true
    });
  }
}
