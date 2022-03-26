import { Graphics } from 'pixi.js';

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
