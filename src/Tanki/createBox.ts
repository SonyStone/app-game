import { Graphics } from "pixi.js";

export function createBox(): Graphics {
	const size: any = { height: 45, width: 45};

  const g = new Graphics();

  g.lineStyle(3, 0x2B2B2B, 1);

  g.beginFill(0x9C9C9C);
  g.drawRect(-size.height / 2, -size.width / 2, size.height, size.width);

  g.moveTo(size.height / 2, size.width / 2);
  g.lineTo(-size.height / 2, -size.width / 2);

  g.moveTo(-size.height / 2, size.width / 2);
  g.lineTo(size.height / 2, -size.width / 2);
  g.endFill();

  return g;
}
