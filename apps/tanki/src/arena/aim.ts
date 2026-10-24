import type { Tank } from './bodies';
import { screenToWorld, type Camera } from './camera';
import type { Aim } from './input';

/**
 * Turns `tank`'s turret toward the player's aim at once: at a screen point, such as the mouse
 * cursor or a touch, or along a screen direction from a gamepad stick. Without aim the turret
 * stays put.
 */
export function applyAim(tank: Tank, aim: Aim | undefined, camera: Camera, screen: { width: number; height: number }) {
  const angle = aimAngle(tank, aim, camera, screen);

  if (angle !== undefined) {
    tank.turretAngle = angle;
  }
}

/**
 * The world direction in radians the player aims `tank`'s turret, as for `applyAim`; `undefined` without aim.
 *
 * @param from - Where the gun turns, which a point aimed at is seen from; defaults to the hull's center.
 */
export function aimAngle(tank: Tank, aim: Aim | undefined, camera: Camera, screen: { width: number; height: number }, from = tank.hull.translation()) {
  if (aim?.kind === 'point') {
    const target = screenToWorld(camera, aim, screen);
    return Math.atan2(target.y - from.y, target.x - from.x);
  }

  return aim?.kind === 'direction' ? aim.angle - camera.rotation : undefined;
}
