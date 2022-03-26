import { Application, filters, Geometry, Graphics, Point, SimplePlane } from 'pixi.js';

export function drawTexture(
  app: Application,
  isoPlane: any,
  vertices: Point[],
  n: number,
  elevationDir: number,
  steepness: number,
  debug?: boolean,
) {
  
  let texture: any;
  
  if(n < 0.3 && steepness === 0 ) {
    texture = app.loader.resources.water.texture;
  } else if(steepness < 20) {
    texture = app.loader.resources.gras.texture;
  } else {
    texture = app.loader.resources.rock.texture;
  }
  
  let plane = new SimplePlane(texture, 0, 0);
  let geometry = new Geometry();
  let colorMatrix = new filters.ColorMatrixFilter();
  
  if(elevationDir === 1 || elevationDir === 2) {
    colorMatrix.brightness(0.65, false); // !!
  }
  if(elevationDir === 3 || elevationDir === 4) {
    colorMatrix.brightness(1.35, false); // !!
  }
  plane.filters = [colorMatrix];

  geometry.addAttribute('positions', [
    vertices[0].x, vertices[0].y,
    vertices[1].x, vertices[1].y,
    vertices[2].x, vertices[2].y,
    vertices[3].x, vertices[3].y
  ], 2);
  
  geometry.addAttribute('uvs', [
    0, 0,
    1, 0,
    0, 1,
    1, 1
  ], 2);
  
  geometry.addIndex([0, 1, 2, 1, 2, 3]);
  plane.geometry = geometry;
  isoPlane.addChild(plane);
  
  let g = new Graphics();

  g.lineStyle({
    'width': 1,
    'color': 0xFFFFFF,
    'alpha': 0.3,
    'native': true
  });

  g.drawPolygon(vertices[0], vertices[1], vertices[2]);
  g.drawPolygon(vertices[1], vertices[2], vertices[3]);

  if(debug) {
    isoPlane.addChild(g);
  }
  
}
