import { Graphics, Point } from "pixi.js";

export function drawColor(
  isoPlane: any,
  vertices: Point[],
  n: number,
  elevationDir: number,
  steepness: number,
  debug?: boolean,
) {

  let color = 0x000000;

  if(n < 0.3 && steepness === 0) {
    color = 0x000F96;
    if (elevationDir === 1 || elevationDir === 2) {
      color = 0x000F82;
    }
    if (elevationDir === 3 || elevationDir === 4) {
      color = 0x000FAA;
    }
  } else if(steepness < 20) {
    color = 0x1A9600;
    if (elevationDir === 1 || elevationDir === 2) {
      color = 0x1A8C00;
    }
    if (elevationDir === 3 || elevationDir === 4) {
      color = 0x1AA000;
    }
  } else {
    color = 0x7F7E7B;
    if (elevationDir === 1 || elevationDir === 2) {
      color = 0x727170;
    }
    if (elevationDir === 3 || elevationDir === 4) {
      color = 0x8C8A88;
    }
  }

  let g = new Graphics();

  g.beginFill(Number(color));

  if(debug) {
    g.lineStyle({
      'width': 1,
      'color': 0xFFFFFF,
      'alpha': 0.2,
      'native': true
    });
  }

  g.drawPolygon([vertices[0], vertices[1], vertices[2]]);
  g.drawPolygon([vertices[1], vertices[2], vertices[3]]);
  g.endFill();

  isoPlane.addChild(g);
}