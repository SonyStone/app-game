import { parseGID } from './parse-gid';

function copyPoints(p: { x: number; y: number }) {
  return { x: p.x, y: p.y };
}

export interface ParsedObject {
  id: any;
  name: string;
  type: any;
  rotation: any;
  properties: any;
  visible: any;
  x: number;
  y: number;
  width: number;
  height: number;
  gid?: any;
  flippedHorizontal?: boolean;
  flippedVertical?: boolean;
  flippedAntiDiagonal?: boolean;
  polyline?: any;
  polygon?: any;
  ellipse?: any;
  text?: any;
  point?: boolean;
  rectangle?: boolean;
}

/**
 * Convert a Tiled object to an internal parsed object normalising and copying properties over, while applying optional x and y offsets. The parsed object will always have the properties `id`, `name`, `type`, `rotation`, `properties`, `visible`, `x`, `y`, `width` and `height`. Other properties will be added according to the object type (such as text, polyline, gid etc.)
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.ParseObject
 * @since 3.0.0
 *
 * @param {object} tiledObject - Tiled object to convert to an internal parsed object normalising and copying properties over.
 * @param {number} [offsetX=0] - Optional additional offset to apply to the object's x property. Defaults to 0.
 * @param {number} [offsetY=0] - Optional additional offset to apply to the object's y property. Defaults to 0.
 *
 * @return {object} The parsed object containing properties read from the Tiled object according to it's type with x and y values updated according to the given offsets.
 */
export function parseObject(
  tiledObject: any,
  offsetX = 0,
  offsetY = 0
): ParsedObject {
  if (offsetX === undefined) {
    offsetX = 0;
  }
  if (offsetY === undefined) {
    offsetY = 0;
  }

  let parsedObject: ParsedObject = {
    id: tiledObject.id,
    name: tiledObject.name,
    type: tiledObject.type,
    rotation: tiledObject.rotation,
    properties: tiledObject.properties,
    visible: tiledObject.visible,
    x: tiledObject.x,
    y: tiledObject.y,
    width: tiledObject.width,
    height: tiledObject.height,
  };

  parsedObject.x += offsetX;
  parsedObject.y += offsetY;

  if (tiledObject.gid) {
    //  Object tiles
    let gidInfo = parseGID(tiledObject.gid);
    parsedObject.gid = gidInfo.gid;
    parsedObject.flippedHorizontal = gidInfo.flippedHorizontal;
    parsedObject.flippedVertical = gidInfo.flippedVertical;
    parsedObject.flippedAntiDiagonal = gidInfo.flippedAntiDiagonal;
  } else if (tiledObject.polyline) {
    parsedObject.polyline = tiledObject.polyline.map(copyPoints);
  } else if (tiledObject.polygon) {
    parsedObject.polygon = tiledObject.polygon.map(copyPoints);
  } else if (tiledObject.ellipse) {
    parsedObject.ellipse = tiledObject.ellipse;
  } else if (tiledObject.text) {
    parsedObject.text = tiledObject.text;
  } else if (tiledObject.point) {
    parsedObject.point = true;
  } else {
    // Otherwise, assume it is a rectangle
    parsedObject.rectangle = true;
  }

  return parsedObject;
}
