import { Graphics } from 'pixi.js';

export function createEllipse() {
  const g = new Graphics();
  g.beginFill(0x778679);
  g.drawEllipse(0, 0, 640, 640);
  g.endFill();
  return g
}