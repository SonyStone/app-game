import type { Tank } from '../../arena/bodies';
import type { Combat } from '../../damage/combat';
import { KIND_RECT, type createRangeRenderer } from '../../damage/renderer';

/**
 * Draws the laser sight of a casemate gun charging a shot, which every player sees, as the dot of
 * the Sniper's rifle in Team Fortress 2 gives a sniper away: a thin beam from the muzzle along the
 * gun to the first wall, crate or tank it meets, at most `range` pixels, and a dot of light where
 * it ends. The beam grows more opaque as the shot charges.
 *
 * @param charge - How far the shot has charged, 0-1.
 * @param color - Color of the beam and its dot, components 0-1.
 */
export function drawSight(
  renderer: ReturnType<typeof createRangeRenderer>,
  combat: Combat,
  tank: Tank,
  charge: number,
  range: number,
  color: readonly number[]
) {
  const angle = tank.turretAngle;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const muzzle = combat.muzzleOf(tank);
  const length = combat.raycast(muzzle, direction, range, (other) => other === tank).distance;
  const end = { x: muzzle.x + direction.x * length, y: muzzle.y + direction.y * length };
  const alpha = BEAM_ALPHA[0] + (BEAM_ALPHA[1] - BEAM_ALPHA[0]) * charge;

  renderer.addBody({ kind: KIND_RECT, x: muzzle.x, y: muzzle.y, angle, originX: 0.5, originY: 0.5 - BEAM_WIDTH / 2, cell: 1, cols: length, rows: BEAM_WIDTH, color, alpha, height: 0 });
  renderer.addBody({ kind: KIND_RECT, x: end.x, y: end.y, angle, originX: 0.5 - DOT / 2, originY: 0.5 - DOT / 2, cell: 1, cols: DOT, rows: DOT, color, height: 0 });
  renderer.addLight(end.x, end.y, DOT_LIGHT, 0.5 + 0.5 * charge, color, DOT_HEIGHT);
}

/** Width of the beam and size of its dot in pixels. */
const BEAM_WIDTH = 1.8;
const DOT = 4;
/** Opacity of the beam with no charge and at full charge. */
const BEAM_ALPHA = [0.45, 0.95];
/** Reach and height of the dot's glow on what it falls on. */
const DOT_LIGHT = 26;
const DOT_HEIGHT = 4;
