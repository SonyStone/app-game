import type { TankClassId } from '../tanks';

/**
 * How a bot fights in each class:
 *
 * - `reach`: the farthest it opens fire at, and `duel` the range it keeps in a fight face to face.
 * - `hits`: hits, or volleys, it expects to need to reach the core of a medium tank from behind,
 *   from the side and from the front, from shots at still and moving targets in simulation.
 * - `aimError`: how many times its usual aim error it still fires at, more for a spread of
 *   pellets or rounds, which forgive a worse aim.
 * - `dodge`: the chance it sidesteps a shell or a laser it sees coming, highest for the nimble Scout.
 * - `steadiness`: a factor on its aim error. The Sniper's rail hits at once where the gun points,
 *   with no flight time that lets a shell's error and a target's dodge cancel out, so its hand is
 *   made unsteadier than the others' to keep a headshot a feat: 1.5 times when a rail had to cross
 *   the core, 2 times since a full charge also kills passing within 2.2 px of it, which made bot
 *   snipers kill half again as often as they died.
 */
export type ClassTactics = {
  reach: number;
  duel: { min: number; max: number };
  hits: { rear: number; side: number; front: number };
  aimError: number;
  dodge: number;
  steadiness: number;
};

/** Tactics of every class; see `ClassTactics`. */
export const TACTICS: Record<TankClassId, ClassTactics> = {
  scout: { reach: 230, duel: { min: 40, max: 110 }, hits: { rear: 1, side: 2, front: 3 }, aimError: 2, dodge: 0.6, steadiness: 1 },
  soldier: { reach: 470, duel: { min: 200, max: 380 }, hits: { rear: 2, side: 3, front: 4 }, aimError: 1, dodge: 0.5, steadiness: 1 },
  heavy: { reach: 380, duel: { min: 90, max: 240 }, hits: { rear: 4, side: 8, front: 16 }, aimError: 3, dodge: 0.3, steadiness: 1 },
  demoman: { reach: 480, duel: { min: 290, max: 450 }, hits: { rear: 2, side: 3, front: 5 }, aimError: 1.3, dodge: 0.5, steadiness: 1 },
  sniper: { reach: 900, duel: { min: 420, max: 720 }, hits: { rear: 1, side: 1, front: 1 }, aimError: 0.8, dodge: 0.4, steadiness: 2 }
};

/**
 * How much tougher than a medium tank each class is to kill, as a factor on the hits it takes:
 * the Scout's thin armor and the Heavy's thick armor.
 */
export const TOUGHNESS: Record<TankClassId, number> = { scout: 0.7, soldier: 1, heavy: 1.7, demoman: 0.9, sniper: 1 };
