import { Camera } from './camera';
import { Dot } from './dot';
import { Renderer } from './renderer';
import { Vector } from './vector';

import { Pointer, PointerEvent } from './pointer';
import { UiColorPicker } from './ui-color-picker';
import { UiScaleSlider } from './ui-scale-slider';

export class DotManager {
  public dots: Dot[] = [];

  constructor(
    private pointer: Pointer,
    public camera: Camera,
    public uiColorPicker: UiColorPicker,
    public uiScaleSlider: UiScaleSlider
  ) {
    this.pointer.subscribe('down', this.onPointerEvent);
    this.pointer.subscribe('drag', this.onPointerEvent);
  }

  destroy() {
    this.pointer.unsubscribe('down', this.onPointerEvent);
    this.pointer.unsubscribe('drag', this.onPointerEvent);
  }

  onPointerEvent = (ev: PointerEvent) => {
    if (this.camera.dragMode) {
      return;
    }
    const position = this.screenToWorldPosition(ev.target);

    const dot = new Dot(position, this.uiColorPicker, this.uiScaleSlider);

    this.dots.push(dot);
  };

  screenToWorldPosition(position: Vector) {
    const x = position.x - this.camera.position.x;
    const y = position.y - this.camera.position.y;

    return new Vector(x, y);
  }

  render(renderer: Renderer) {
    this.dots.forEach((ent, index) => {
      ent.render(renderer, index);
    });
  }
}
