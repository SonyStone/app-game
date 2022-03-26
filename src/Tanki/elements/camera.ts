import { Container, Point } from 'pixi.js';

import { Vec2 } from '../math/vec2';
import { Vector2d } from '../math/vector2d';

export default class Camera {
  public position: Vector2d;
  public zoom;
  public rotation;
  public focus: Vector2d;

  constructor(position ? , zoom ? , rotation ? ) {
    this.position = position || new Vector2d();
    this.zoom = zoom || 1;
    this.rotation = rotation || 0;
    this.focus = new Vector2d();
  }

  /**
   * targeting
   */
  public targeting(target: Vector2d): Vec2 {
    return Vec2.mult(target, this.zoom).rotate(this.rotation).add(this.position);
  }

  /**
   * manipulation
   */
  public manipulation(keyboard, mouse) {
    if (keyboard.NumpadAdd.pressed || mouse.WheelUp.pressed) { this.zoom *= 1.1; }
    if (keyboard.NumpadSub.pressed || mouse.WheelDown.pressed) { this.zoom /= 1.1; }

    if (keyboard.e.pressed) { this.rotation -= 0.1; }
    if (keyboard.q.pressed) { this.rotation += 0.1; }
  }

  public focusing(canvas ?: any, focus ?: Vector2d) {
    if (focus === undefined) {
      focus = new Vector2d();
    }
    this.focus.set(canvas.width / 2, canvas.height / 2);

    this.position = this.position.set(focus.positioning(this));
  }


  public draw(context) {
    context.translate(this.position.x, this.position.y);
    context.scale(this.zoom, this.zoom);
    context.rotate(this.rotation);
  }

  public translate(stage: Container) {
    stage.scale = new Point(this.zoom, this.zoom);
    stage.position = new Point(this.position.x, this.position.y);
    stage.rotation = this.rotation;
  }

  public toString() {
    return `camera \n` +
      `position: ${this.position}\n` +
      `zoom: ${this.zoom}\n` +
      `rotation: ${this.rotation}\n`;
  }
}
