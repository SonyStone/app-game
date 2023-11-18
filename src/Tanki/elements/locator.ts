import { Container, Graphics } from "pixi.js";

const width = 0.1;
const red_x = 0xff0000;
const blue_y = 0x0000ff;
const locator = () =>
  new Graphics()
    .lineStyle(width, red_x, 1)
    .moveTo(0, 0)
    .lineTo(1, 0)

    .lineStyle(width, blue_y, 1)
    .moveTo(0, 0)
    .lineTo(0, 1);

export function createLocator() {
  const container = new Container();

  container.addChild(locator());

  return container;
}
