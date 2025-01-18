import { Context } from './context';
import { Emitter } from './emitter';
import { Vector } from './vector';

// @TODO: Can/should we add world coords?
export interface PointerEvent {
  target: Vector;
  origin: Vector;
}

export class Pointer extends Emitter<PointerEvent> {
  dragOrigin: Vector | null = null;

  constructor(context: Context) {
    super();
    context.canvas.addEventListener('mousedown', this.onDown);
    context.canvas.addEventListener('mousemove', this.onMove);
    context.canvas.addEventListener('mouseup', this.onUp);
  }

  onDown = (ev: MouseEvent) => {
    const position = new Vector(ev.x, ev.y);
    const pointerEvent = {
      target: position,
      // @TODO: Don't want origin here.
      origin: position
    };

    this.publish('down', pointerEvent);

    this.dragOrigin = new Vector(ev.x, ev.y);
  };

  onUp = () => {
    this.dragOrigin = null;
  };

  // @TODO: Debounce
  // @TODO: Stop creating vector each time.
  onMove = (ev: MouseEvent) => {
    if (!this.dragOrigin) {
      return;
    }

    const pointerEvent = {
      target: new Vector(ev.x, ev.y),
      origin: this.dragOrigin
    };

    this.publish('drag', pointerEvent);

    this.dragOrigin = new Vector(ev.x, ev.y);
  };
}
