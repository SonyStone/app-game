import type { Tank } from './bodies';
import { screenToWorld, type Camera } from './camera';
import type { Aim } from './input';

/**
 * Turns `tank`'s turret toward the player's aim: at a screen point, such as the mouse cursor or
 * a touch, or along a screen direction from a gamepad stick. Without aim the turret stays put.
 */
export function applyAim(tank: Tank, aim: Aim | undefined, camera: Camera, screen: { width: number; height: number }) {
  if (aim?.kind === 'point') {
    const target = screenToWorld(camera, aim, screen);
    const center = tank.hull.translation();
    tank.turretAngle = Math.atan2(target.y - center.y, target.x - center.x);
  } else if (aim?.kind === 'direction') {
    tank.turretAngle = aim.angle - camera.rotation;
  }
}
