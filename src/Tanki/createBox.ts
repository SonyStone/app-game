import { Graphics } from "pixi.js";

export const createBox = (height = 45, width = 45) =>
  new Graphics()
    .lineStyle(3, 0x2b2b2b, 1)

    .beginFill(0x9c9c9c)
    .drawRect(-height / 2, -width / 2, height, width)

    .moveTo(height / 2, width / 2)
    .lineTo(-height / 2, -width / 2)

    .moveTo(-height / 2, width / 2)
    .lineTo(height / 2, -width / 2)
    .endFill();
