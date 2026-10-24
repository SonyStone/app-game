import { beforeAll, describe, expect, it } from 'vitest';
import type { Rapier } from '../physics/Rapier2D';
import { createHeadlessSandbox, runSandbox } from './headless';
import type { Tally } from './sandbox';
import { ABILITIES, GAITS, VISIBILITY_RULES } from './variants';

/**
 * Measures the bot spider against the bot tanks under every variant: how many of its attempts on
 * a stern work and how long one takes. Slow, so it runs only on request, for as many simulated
 * minutes per variant as `SPY_METRICS` says:
 *
 *     SPY_METRICS=10 pnpm exec vitest run src/spy/metrics.test.ts
 */
const minutes = Number(import.meta.env.SPY_METRICS ?? 0);
const SEEDS = [1, 2, 3, 4];

let rapier: Rapier;

beforeAll(async () => {
  rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
});

describe.runIf(minutes > 0)('the bot spider against the bot tanks', () => {
  it(`tallies attempts over ${minutes} simulated minutes per variant`, () => {
    const rows = [];

    for (const visibility of VISIBILITY_RULES) {
      for (const ability of ABILITIES) {
        for (const gait of GAITS) {
          const total = emptyTally();

          for (const seed of SEEDS) {
            const { sandbox, world } = createHeadlessSandbox(rapier, { role: 'watch', visibility, ability, gait, cones: 'off' }, { seed });
            runSandbox(sandbox, (minutes * 60) / SEEDS.length);
            add(total, sandbox.tally);
            world.free();
          }

          rows.push(summarize(`${visibility}/${ability}/${gait}`, total));
        }
      }
    }

    console.table(rows);
    expect(rows.every((row) => row.attempts > 0)).toBe(true);
  }, 600_000);
});

function emptyTally(): Tally {
  return { attempts: 0, successes: 0, times: [], failures: { spotted: 0, timeout: 0, 'lost target': 0, killed: 0, 'knocked off': 0 }, deaths: 0, hijackKills: 0, hijackHits: 0, hitsTaken: 0 };
}

function add(total: Tally, tally: Readonly<Tally>) {
  total.attempts += tally.attempts;
  total.successes += tally.successes;
  total.times.push(...tally.times);
  total.deaths += tally.deaths;
  total.hijackKills += tally.hijackKills;
  total.hijackHits += tally.hijackHits;
  total.hitsTaken += tally.hitsTaken;

  for (const reason of Object.keys(total.failures) as (keyof Tally['failures'])[]) {
    total.failures[reason] += tally.failures[reason];
  }
}

/** One row of the table: per-minute rates, the share of attempts that worked and how long they took. */
function summarize(variant: string, tally: Tally) {
  const sorted = [...tally.times].sort((a, b) => a - b);
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : NaN;

  return {
    variant,
    attempts: tally.attempts,
    worked: tally.successes,
    'worked %': Math.round((tally.successes / Math.max(tally.attempts, 1)) * 100),
    'per min': +(tally.successes / minutes).toFixed(2),
    'median s': +median.toFixed(1),
    spotted: tally.failures.spotted,
    timeout: tally.failures.timeout,
    'knocked off': tally.failures['knocked off'] + tally.failures.killed,
    'lost target': tally.failures['lost target'],
    deaths: tally.deaths,
    'hijack hits/kills': `${tally.hijackHits}/${tally.hijackKills}`,
    'hit by own team': tally.hitsTaken
  };
}
