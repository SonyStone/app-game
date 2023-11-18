const FLIPPED_HORIZONTAL = 0x80000000;
const FLIPPED_VERTICAL = 0x40000000;
const FLIPPED_ANTI_DIAGONAL = 0x20000000; // Top-right is swapped with bottom-left corners

export interface GIDData {
  /**
   * The Tiled GID.
   */
  gid: number;
  /**
   * Horizontal flip flag.
   */
  flippedHorizontal: boolean;
  /**
   * Vertical flip flag.
   */
  flippedVertical: boolean;
  /**
   * Diagonal flip flag.
   */
  flippedAntiDiagonal: boolean;
  /**
   * Amount of rotation.
   */
  rotation: number;
  /**
   * Is flipped?
   */
  flipped: boolean;
}

/**
 * See Tiled documentation on tile flipping:
 * http://docs.mapeditor.org/en/latest/reference/tmx-map-format/
 *
 * @function Phaser.Tilemaps.Parsers.Tiled.ParseGID
 * @since 3.0.0
 *
 * @param {number} gid - A Tiled GID.
 *
 * @return {Phaser.Types.Tilemaps.GIDData} The GID Data.
 */
export function parseGID(gid: number): GIDData {
  let flippedHorizontal = !!(gid & FLIPPED_HORIZONTAL);
  let flippedVertical = !!(gid & FLIPPED_VERTICAL);
  let flippedAntiDiagonal = !!(gid & FLIPPED_ANTI_DIAGONAL);
  gid = gid & ~(FLIPPED_HORIZONTAL | FLIPPED_VERTICAL | FLIPPED_ANTI_DIAGONAL);

  // Parse the flip flags into something Phaser can use
  let rotation = 0;
  let flipped = false;

  if (flippedHorizontal && flippedVertical && flippedAntiDiagonal) {
    rotation = Math.PI / 2;
    flipped = true;
  } else if (flippedHorizontal && flippedVertical && !flippedAntiDiagonal) {
    rotation = Math.PI;
    flipped = false;
  } else if (flippedHorizontal && !flippedVertical && flippedAntiDiagonal) {
    rotation = Math.PI / 2;
    flipped = false;
  } else if (flippedHorizontal && !flippedVertical && !flippedAntiDiagonal) {
    rotation = 0;
    flipped = true;
  } else if (!flippedHorizontal && flippedVertical && flippedAntiDiagonal) {
    rotation = (3 * Math.PI) / 2;
    flipped = false;
  } else if (!flippedHorizontal && flippedVertical && !flippedAntiDiagonal) {
    rotation = Math.PI;
    flipped = true;
  } else if (!flippedHorizontal && !flippedVertical && flippedAntiDiagonal) {
    rotation = (3 * Math.PI) / 2;
    flipped = true;
  } else if (!flippedHorizontal && !flippedVertical && !flippedAntiDiagonal) {
    rotation = 0;
    flipped = false;
  }

  return {
    gid,
    flippedHorizontal,
    flippedVertical,
    flippedAntiDiagonal,
    rotation,
    flipped,
  };
}
