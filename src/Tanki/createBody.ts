import { Graphics } from 'pixi.js';

export function createBody() {
  return new Graphics()
    .lineStyle(2, 0x191919, 1)
    .beginFill(0xbf3030)
    .drawRect(-20, -15, 40, 30)
    .endFill()

    .moveTo(-20, 15)
    .lineTo(20, 0.5)
    .lineTo(20, -0.5)
    .lineTo(-20, -15);
}
