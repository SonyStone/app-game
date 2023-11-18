import { CONST } from './orientation-const';

/**
 * Get the Tilemap orientation from the given string.
 *
 * @function Phaser.Tilemaps.Parsers.FromOrientationString
 * @since 3.50.0
 *
 * @param {string} [orientation] - The orientation type as a string.
 *
 * @return {Phaser.Tilemaps.OrientationType} The Tilemap Orientation type.
 */
export function fromOrientationString(orientation: string) {
  orientation = orientation.toLowerCase();

  if (orientation === 'isometric') {
    return CONST.ISOMETRIC;
  } else if (orientation === 'staggered') {
    return CONST.STAGGERED;
  } else if (orientation === 'hexagonal') {
    return CONST.HEXAGONAL;
  } else {
    return CONST.ORTHOGONAL;
  }
}
