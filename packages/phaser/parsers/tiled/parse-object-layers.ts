import { createGroupLayer } from './create-group-layer';
import { parseObject } from './parse-object';

/**
 * Parses a Tiled JSON object into an array of ObjectLayer objects.
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.ParseObjectLayers
 * @since 3.0.0
 *
 * @param {object} json - The Tiled JSON object.
 *
 * @return {array} An array of all object layers in the tilemap as `ObjectLayer`s.
 */
export function parseObjectLayers(json: any): Phaser.Tilemaps.ObjectLayer[] {
  let objectLayers: Phaser.Tilemaps.ObjectLayer[] = [];

  // State inherited from a parent group
  let groupStack: any[] = [];
  let curGroupState = createGroupLayer(json);

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
      curGroupState = groupStack.pop();
      continue;
    }

    // Get current layer and advance iterator
    let curo = curGroupState.layers[curGroupState.i];
    curGroupState.i++;

    // Modify inherited properties
    curo.opacity *= curGroupState.opacity;
    curo.visible = curGroupState.visible && curo.visible;

    if (curo.type !== 'objectgroup') {
      if (curo.type === 'group') {
        // Compute next state inherited from group
        let nextGroupState = createGroupLayer(json, curo, curGroupState);

        // Preserve current state before recursing
        groupStack.push(curGroupState);
        curGroupState = nextGroupState;
      }

      // Skip this layer OR 'recurse' (iterative style) into the group
      continue;
    }

    curo.name = curGroupState.name + curo.name;
    let offsetX = curGroupState.x + (curo.startx ?? 0) + (curo.offsetx ?? 0);
    let offsetY = curGroupState.y + (curo.starty ?? 0) + (curo.offsety ?? 0);

    let objects = [];
    for (let j = 0; j < curo.objects.length; j++) {
      let parsedObject = parseObject(curo.objects[j], offsetX, offsetY);

      objects.push(parsedObject);
    }

    let objectLayer = new Phaser.Tilemaps.ObjectLayer(curo);
    objectLayer.objects = objects;

    objectLayers.push(objectLayer);
  }

  return objectLayers;
}
