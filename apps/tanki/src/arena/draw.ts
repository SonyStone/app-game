import type { Graphics } from 'pixi.js';
import { ARENA } from './level';

/**
 * Static drawings of arena objects, traced from the Godot prototype's Inkscape art
 * (`assets/g1.svg`, `g2.svg`, `g5.svg`), which Godot showed at a quarter of its size:
 * a 4 px outline there is 1 px here. Each function appends to `graphics` in local coordinates
 * with the object's front along +x.
 */

/** Hull: a rounded box with lines from its rear corners to the middle of its nose. */
export function drawHull(graphics: Graphics, color: number) {
  return graphics
    .roundRect(-20, -12.5, 40, 25, 1)
    .fill(color)
    .stroke(OUTLINE)
    .moveTo(-19.5, 12.25)
    .lineTo(20, 0)
    .lineTo(-19.5, -12.25)
    .stroke({ ...OUTLINE, cap: 'round', join: 'round' });
}

/** Turret: a barrel under a round cupola, pivoting at the hull center. */
export function drawTurret(graphics: Graphics, color: number) {
  return graphics.roundRect(7.3, -3.75, 22.5, 7.5, 1).fill(color).stroke(OUTLINE).circle(0, 0, 9.6).fill(color).stroke(OUTLINE);
}

/** Crate: a long box crossed by its diagonals. */
export function drawCrate(graphics: Graphics) {
  return graphics
    .roundRect(-21.25, -46.25, 42.5, 92.5, 2)
    .fill(PROP_COLOR)
    .stroke(OUTLINE)
    .moveTo(-20.75, -45)
    .lineTo(20.75, 45)
    .moveTo(20.75, -45)
    .lineTo(-20.75, 45)
    .stroke({ ...OUTLINE, cap: 'round' });
}

/** Floor of the arena and its pillar, in world coordinates. */
export function drawArena(graphics: Graphics) {
  const { pillar } = ARENA;

  return graphics.poly(ARENA.floor).fill(FLOOR_COLOR).circle(pillar.x, pillar.y, pillar.radius).fill(PROP_COLOR).stroke(OUTLINE);
}

/** Godot's default clear color, which shows outside the floor. */
export const BACKGROUND_COLOR = 0x4d4d4d;

/** Player's hull color, the green of the 2017 art. */
export const PLAYER_COLOR = 0x2fbf3b;

/** Gray of every Godot tank and crate. */
export const PROP_COLOR = 0x999999;

const FLOOR_COLOR = 0x838383;
const OUTLINE = { width: 1, color: 0x000000 };
