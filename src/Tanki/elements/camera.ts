import { Container } from "pixi.js";
import { Vec2 } from "../math/vec2";

export default class Camera extends Container {
  /**
   * targeting
   */
  // public targeting(target: Vector2d): Vec2 {
  //   return Vec2.mult(target, this.zoom)
  //     .rotate(this.rotation)
  //     .add(this.position);
  // }
  // public focusing(canvas?: any, focus?: Vector2d) {
  //   if (focus === undefined) {
  //     focus = new Vector2d();
  //   }
  //   this.focus.set(canvas.width / 2, canvas.height / 2);
  //   this.position = this.position.set(focus.positioning(this));
  // }
}
