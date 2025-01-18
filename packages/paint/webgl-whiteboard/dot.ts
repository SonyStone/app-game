import { DotMesh } from './dot-mesh';
import { Renderer } from './renderer';
import { UiColorPicker } from './ui-color-picker';
import { UiScaleSlider } from './ui-scale-slider';
import { Vector } from './vector';

export class Dot {
  mesh: DotMesh;
  position: Vector;
  scale: Vector;
  positionUniform: WebGLUniformLocation | null = null;
  scaleUniform: WebGLUniformLocation | null = null;

  constructor(position: Vector, uiColorPicker: UiColorPicker, uiScaleSlider: UiScaleSlider) {
    this.scale = new Vector(uiScaleSlider.value, uiScaleSlider.value);
    this.mesh = new DotMesh({
      color: uiColorPicker.value,
      polyCount: 20
    });
    this.position = position;
  }

  render(renderer: Renderer, index: number) {
    if (this.positionUniform === null) {
      this.positionUniform = renderer.gl.getUniformLocation(renderer.program, 'u_position');
    }

    if (this.scaleUniform === null) {
      this.scaleUniform = renderer.gl.getUniformLocation(renderer.program, 'u_scale');
    }
    renderer.gl.uniform2f(this.positionUniform, this.position.x, this.position.y);

    renderer.gl.uniform2f(this.scaleUniform, this.scale.x, this.scale.y);

    const primitiveType = renderer.gl.TRIANGLES;
    // @NOTE: If we ever have scene entities of different vertex lengths,
    // we will need to keep track of the offset. Either in a var or using a
    // .reduce instead of .forEach?
    const offset = index * this.mesh.vectors.length;
    const count = this.mesh.vectors.length;
    renderer.gl.drawArrays(primitiveType, offset, count);
  }
}
