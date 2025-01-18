import { Key, Keyboard } from './keyboard';
import { Pointer, PointerEvent } from './pointer';
import { Renderer } from './renderer';
import { Vector } from './vector';

export class Camera {
  public position = new Vector(0, 0);
  public dragMode = false;
  private uniform: WebGLUniformLocation | null;

  constructor(
    private pointer: Pointer,
    private keyboard: Keyboard
  ) {
    this.keyboard.subscribe('keyDown', this.onKeyDown);
    this.keyboard.subscribe('keyUp', this.onKeyUp);
    this.pointer.subscribe('drag', this.onPointerDrag);
    this.uniform = null;
  }

  destroy() {
    this.keyboard.unsubscribe('keyDown', this.onKeyDown);
    this.keyboard.unsubscribe('keyUp', this.onKeyUp);
    this.pointer.unsubscribe('drag', this.onPointerDrag);
  }

  onKeyDown = (ev: KeyboardEvent) => {
    if (ev.which === Key.Space && !this.dragMode) {
      this.dragMode = true;
      document.body.style.cursor = 'grab';
    }
  };

  onKeyUp = (ev: KeyboardEvent) => {
    if (ev.which === Key.Space) {
      this.dragMode = false;
      document.body.style.cursor = 'default';
    }
  };

  onPointerDrag = (ev: PointerEvent) => {
    if (!this.dragMode) {
      return;
    }

    const offset = ev.target.subtract(ev.origin);
    this.position.x += offset.x;
    this.position.y += offset.y;
  };

  render(renderer: Renderer) {
    if (this.uniform === null) {
      this.uniform = renderer.gl.getUniformLocation(renderer.program, 'u_camera_position');
    }

    renderer.gl.uniform2f(this.uniform, this.position.x, this.position.y);
  }
}
