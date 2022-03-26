import { Graphics } from 'pixi.js';

export function createGun() {
  return new Graphics()
    .beginFill(0xbf3030)
    .lineStyle(2, 0x191919, 1)
    .drawRect(0, -10 / 2, 30, 10)
    .closePath()

    .drawCircle(0, 0, 10)
    .closePath()
    .endFill();
}
