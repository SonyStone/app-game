export interface GroupLayer {
  /** Current layer array iterator */
  i: number;
  /** Current array of layers */
  layers: any[];
  // Values inherited from parent group
  name: string;
  opacity: number;
  visible: boolean;
  x: number;
  y: number;
}

/**
 * Parse a Tiled group layer and create a state object for inheriting.
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.CreateGroupLayer
 * @since 3.21.0
 *
 * @param {object} json - The Tiled JSON object.
 * @param {object} [group] - The current group layer from the Tiled JSON file.
 * @param {object} [parentState] - The state of the parent group (if any).
 *
 * @return {object} A group state object with proper values for updating children layers.
 */
export function createGroupLayer(
  json: any,
  group?: any,
  parentState?: any
): GroupLayer {
  if (!group) {
    // Return a default group state object
    return {
      i: 0, // Current layer array iterator
      layers: json.layers, // Current array of layers
      // Values inherited from parent group
      name: '',
      opacity: 1,
      visible: true,
      x: 0,
      y: 0,
    };
  }

  // Compute group layer x, y
  let layerX =
    group.x + (group.startx ?? 0) * json.tilewidth + (group.offsetx ?? 0);
  let layerY =
    group.y + (group.starty ?? 0) * json.tileheight + (group.offsety ?? 0);

  // Compute next state inherited from group
  return {
    i: 0,
    layers: group.layers,
    name: parentState.name + group.name + '/',
    opacity: parentState.opacity * group.opacity,
    visible: parentState.visible && group.visible,
    x: parentState.x + layerX,
    y: parentState.y + layerY,
  };
}
