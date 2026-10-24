/**
 * The first arena, carried over from the Godot prototype's `scenes/main.tscn` (`~/1D/godot/atanki-game`).
 *
 * Coordinates are Godot pixels with the y axis pointing down, which is also Pixi's convention,
 * so the values are copied unchanged. Angles are radians, clockwise on screen.
 */
export const ARENA = {
  /**
   * Outline of the drivable floor, a closed loop. Godot stored the walls as one collision polygon:
   * this outer rectangle with the floor cut out through a thin slit. Only the inner outline matters
   * for play, so it is kept as a loop and becomes a two-sided wall.
   */
  floor: [
    { x: -515, y: 343 },
    { x: -497, y: 394 },
    { x: -284, y: 267 },
    { x: -308, y: 206 },
    { x: -245, y: -337 },
    { x: 316, y: -372 },
    { x: 547, y: -64 },
    { x: 368, y: 365 },
    { x: -176, y: 515 },
    { x: -219, y: 426 },
    { x: -447, y: 553 },
    { x: -418, y: 654 },
    { x: -481, y: 961 },
    { x: -818, y: 1003 },
    { x: -949, y: 652 },
    { x: -1008, y: 403 }
  ],

  /** Round static obstacle that held the Godot icon. */
  pillar: { x: 0, y: -8, radius: 10 },

  /** Where the player's tank starts. */
  player: { x: -73, y: 10, rotation: 0 },

  /** Idle tanks: in Godot they all read the player's input; here they stand still as targets. */
  tanks: [
    { x: 41, y: 77, rotation: 0 },
    { x: -149, y: 27, rotation: 0 },
    { x: 198, y: 8, rotation: 0 },
    { x: -37, y: -132, rotation: 0 },
    { x: -202, y: -45, rotation: 0 },
    { x: 115, y: -86, rotation: 0 },
    { x: -66, y: 123, rotation: 0 },
    { x: -210, y: 145, rotation: 0 },
    { x: 171, y: 147, rotation: 0 }
  ],

  /** Pushable crates. */
  boxes: [
    { x: 64, y: -122, rotation: 0 },
    { x: -99, y: -54, rotation: 0.765811 },
    { x: 9, y: 198, rotation: 2.13229 },
    { x: -139, y: 131, rotation: 0 },
    { x: 110, y: 109, rotation: 0 }
  ]
};

/** A position and heading in arena coordinates. */
export type Placement = (typeof ARENA.boxes)[number];
