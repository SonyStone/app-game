import { beforeAll, describe, expect, it } from 'vitest';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { createKothMatch, type KothMatch, type PlayerInput } from './match';
import { PACE_DEFAULTS } from './pace';
import { CAPTURE_RULES } from './rules';

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

/**
 * A match is deterministic: the same seed and the same player's input give the same match bit for
 * bit, whatever the frame rate, which replays and forks rely on. In 2026 the same held across
 * Node 22, Chrome 156 and Safari 26 for whole five-minute matches, once the simulation computed
 * its sines and the like with `../physics/math`; this test cannot run in other engines, so it
 * guards what made that so.
 */
describe('a deterministic match', () => {
  it('plays the same from the same seed and input, at any frame rate', () => {
    const steady = play(17, () => [1 / 60]);
    const frames = random(5);
    // Frames of 4 to 34 ms, as a busy display gives them, with the effects updated by each.
    const ragged = play(17, () => {
      const lengths: number[] = [];
      let left = 1 / 60;

      while (left > 0) {
        const length = Math.min(0.004 + frames() * 0.03, left);
        lengths.push(length);
        left -= length;
      }

      return lengths;
    });

    expect(ragged).toEqual(steady);
    // A different seed is a different match, so the hashes do tell matches apart.
    expect(play(19, () => [1 / 60]).at(-1)).not.toBe(steady.at(-1));
  });

  it('simulates with deterministic math only', () => {
    const offenders: string[] = [];

    for (const path of simulationModules()) {
      const code = stripComments(SOURCES[path]);

      for (const [pattern, why] of NONDETERMINISTIC) {
        if (pattern.test(code)) {
          offenders.push(`${path}: ${why}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});

/**
 * Plays 20 s of an eight-seat match with the player's seat driven by an input that changes every
 * third of a second, updating the effects over the frames `frames` gives for each step; returns a
 * hash of the match after every second.
 */
function play(seed: number, frames: () => number[]) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const match = createKothMatch(rapier, world, fakeRenderer(), {
    random: random(seed),
    pace: () => PACE_DEFAULTS,
    rules: { ...CAPTURE_RULES, unlockTime: 5 }
  });
  const inputs = random(seed + 1);
  const hashes: string[] = [];
  let input: PlayerInput = { drive: { x: 0, y: 0 }, fire: false };

  for (let step = 1; step <= 20 * 60; step++) {
    if (step % 20 === 1) {
      const heading = inputs() * Math.PI * 2;
      input = { drive: { x: Math.cos(heading), y: Math.sin(heading) }, aim: inputs() * Math.PI * 2, fire: inputs() < 0.6, reach: 300 };
    }

    match.step(1 / 60, input);

    for (const frame of frames()) {
      match.update(frame);
    }

    if (step % 60 === 0) {
      hashes.push(hashOf(match, world));
    }
  }

  world.free();
  return hashes;
}

/** FNV-1a over the bits of every body's pose and motion, the seats, the shells, the capture and what the bots are doing. */
function hashOf(match: KothMatch, world: InstanceType<Rapier['World']>) {
  const numbers: number[] = [match.time];

  world.forEachRigidBody((body) => {
    const at = body.translation();
    const velocity = body.linvel();
    numbers.push(body.handle, at.x, at.y, body.rotation(), velocity.x, velocity.y, body.angvel());
  });

  for (const member of match.members) {
    numbers.push(member.kills, member.deaths, member.respawnAt ?? -1, member.tank?.turretAngle ?? -1, member.tank ? match.combat.armorLeft(member.tank) : -1);
  }

  for (const shell of match.combat.shells) {
    numbers.push(shell.x, shell.y);
  }

  numbers.push(match.capture.held.red, match.capture.held.blue, match.capture.progress);
  let hash = 0x811c9dc5;

  for (const byte of new Uint8Array(new Float64Array(numbers).buffer)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }

  const thoughts = match.thoughts().map((thought) => `${thought.goal}/${thought.action}`);
  return `${hash.toString(16)} ${thoughts.join(' ')}`;
}

/**
 * Sources of the modules a match runs, by path from `src`: those `./match` imports, directly or
 * not, but for the ones that only draw, whose numbers never reach the battle.
 */
function simulationModules() {
  const found = new Set<string>();
  const queue = ['koth/match.ts'];

  while (queue.length > 0) {
    const path = queue.pop()!;

    if (found.has(path)) {
      continue;
    }

    found.add(path);

    for (const [, specifier] of SOURCES[path].matchAll(/^import (?!type )[^;]*? from '(\.[^']+)';$/gms)) {
      const resolved = resolve(path, specifier);
      const file = [`${resolved}.ts`, `${resolved}/index.ts`].find((candidate) => candidate in SOURCES);

      if (file) {
        queue.push(file);
      }
    }
  }

  return [...found].filter((path) => !DRAWING_ONLY.includes(path)).sort();
}

/** Every TypeScript module of the app by path from `src`, as text. */
const SOURCES = Object.fromEntries(
  Object.entries(import.meta.glob<string>(['../**/*.ts', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true })).map(
    // Vite names this folder's modules from `./`, the others' from `../`.
    ([path, code]) => [path.replace(/^\.\//, 'koth/').replace(/^\.\.\//, ''), code]
  )
);

/** Modules a match imports only to draw: their numbers go to the screen, never back into the battle. */
const DRAWING_ONLY = ['damage/burning.ts', 'damage/campfire.ts', 'damage/renderer.ts', 'koth/scenery.ts', 'koth/classes/sight.ts'];

/** What would make the simulation differ between engines or frames, and why. */
const NONDETERMINISTIC: [RegExp, string][] = [
  [/Math\.(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt|hypot)\(/, "uses Math's transcendental functions, which engines compute differently; use ../physics/math"],
  [/[\w)\]] \*\* /, 'raises to a power with **, which engines compute differently; multiply'],
  [/Math\.random\(/, "draws from Math.random instead of the match's seeded random"],
  [/performance\.now\(|Date\.now\(/, 'reads the clock']
];

/** `specifier` imported from the module at `from`, as a path from `src` without extension. */
function resolve(from: string, specifier: string) {
  const parts = from.split('/').slice(0, -1);

  for (const part of specifier.split('/')) {
    if (part === '..') {
      parts.pop();
    } else if (part !== '.') {
      parts.push(part);
    }
  }

  return parts.join('/');
}

/** The code without its comments, which may name the functions they warn against. */
function stripComments(code: string) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Park and Miller's generator, as the harnesses seed matches. */
function random(seed: number) {
  let state = seed;

  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** A renderer that only hands out field slots. */
function fakeRenderer() {
  const slots = Array.from({ length: 512 }, (_, index) => 511 - index);
  const renderer = {
    allocateField: () => slots.pop(),
    releaseField: (slot: number) => slots.push(slot),
    uploadField() {},
    beginBodies() {},
    addBody() {},
    spawn() {},
    addSmokeBall() {},
    addLight() {},
    render() {}
  };

  return renderer as unknown as ReturnType<typeof createRangeRenderer>;
}
