import { Graphics } from "pixi.js";

export const createEllipse = () =>
  new Graphics().beginFill(0x778679).drawEllipse(0, 0, 640, 640).endFill();

export const createCircle = () =>
  new Graphics()
    .beginFill(0x5a626b)
    .lineStyle(2, 0x191919, 1)
    .drawEllipse(0, 0, 20, 20)
    .endFill();

/**
 * Bezier class
 */
export class Ellipse {
  ctx = new Graphics();

  /**
   * construct Bezier
   */
  constructor(x: number, y: number) {
    this.ctx.beginFill(0x778679);
    this.ctx.drawEllipse(0, 0, 640, 640);
    this.ctx.x = x;
    this.ctx.y = y;
    this.ctx.endFill();

    return this;
  }
}
