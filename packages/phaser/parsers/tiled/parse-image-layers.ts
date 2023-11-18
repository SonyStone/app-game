import { GroupLayer, createGroupLayer } from './create-group-layer';

export interface Image {
  name: string;
  image: any;
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
  properties: any;
}

/**
 * Parses a Tiled JSON object into an array of objects with details about the image layers.
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.ParseImageLayers
 * @since 3.0.0
 *
 * @param {object} json - The Tiled JSON object.
 *
 * @return {array} Array of objects that include critical info about the map's image layers
 */
export function parseImageLayers(json: any): Image[] {
  let images: Image[] = [];

  // State inherited from a parent group
  let groupStack: GroupLayer[] = [];
  let curGroupState: GroupLayer = createGroupLayer(json);

  while (
    curGroupState.i < curGroupState.layers.length ||
    groupStack.length > 0
  ) {
    if (curGroupState.i >= curGroupState.layers.length) {
      // Ensure recursion stack is not empty first
      if (groupStack.length < 1) {
        console.warn(
          'TilemapParser.parseTiledJSON - Invalid layer group hierarchy'
        );
        break;
      }

      // Return to previous recursive state
      curGroupState = groupStack.pop()!;
      continue;
    }

    // Get current layer and advance iterator
    let curi = curGroupState.layers[curGroupState.i];
    curGroupState.i++;

    if (curi.type !== 'imagelayer') {
      if (curi.type === 'group') {
        // Compute next state inherited from group
        const nextGroupState = createGroupLayer(json, curi, curGroupState);

        // Preserve current state before recursing
        groupStack.push(curGroupState);
        curGroupState = nextGroupState;
      }

      // Skip this layer OR 'recurse' (iterative style) into the group
      continue;
    }

    let layerOffsetX = (curi.offsetx ?? 0) + (curi.startx ?? 0);
    let layerOffsetY = (curi.offsety ?? 0) + (curi.starty ?? 0);
    images.push({
      name: curGroupState.name + curi.name,
      image: curi.image,
      x: curGroupState.x + layerOffsetX + curi.x,
      y: curGroupState.y + layerOffsetY + curi.y,
      alpha: curGroupState.opacity * curi.opacity,
      visible: curGroupState.visible && curi.visible,
      properties: curi.properties ?? {},
    });
  }

  return images;
}
