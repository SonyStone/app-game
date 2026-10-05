/** One task: move the value from `start` to within tolerance of `target`. Practice trials stay out of the stats. */
export type Trial = { start: number; target: number; practice: boolean };

/** Outcome of one trial with one variant. */
export type TrialResult = Trial & {
  variant: string;
  /** Position of the trial within its variant's block, from 0. */
  index: number;
  /** Last committed value; the start value when nothing was committed. */
  final: number;
  skipped: boolean;
  /** From showing the target to the hit, or to the skip. */
  totalMs: number;
  /** From the first press on the control to the hit; unset when the control was never pressed. */
  manipulationMs: number | undefined;
  /** Presses on the control. */
  attempts: number;
  /** Commits outside the tolerance. */
  misses: number;
  /** Pointer type of the first press, such as `pen` or `mouse`. */
  pointerType: string | undefined;
};

/** One benchmark session: its settings, the variant order, and every trial. */
export type Run = {
  /** ISO time the run started; also its identity. */
  id: string;
  hand: 'left' | 'right';
  tolerance: number;
  dialRadius: number;
  order: readonly string[];
  results: TrialResult[];
};

/** Value every run starts from; each later trial starts where the previous target was. */
export const START_VALUE = 24;

/** Targets that are CLIP STUDIO PAINT presets, where snapping can help. */
export const PRESET_TARGETS = [3, 8, 15, 25, 40, 80, 150, 300, 700, 1500];

/** Targets between presets, where snapping cannot help and fine scrubbing or typing must. */
export const FREE_TARGETS = [9, 13, 22, 33, 47, 65, 90, 135, 240, 450, 900];

/**
 * Builds `practice` warm-up trials followed by `count` measured ones, alternating preset and free targets. Each
 * trial starts at the previous target, and consecutive targets differ by at least a quarter, so every trial needs
 * a real change.
 */
export function makeTrials(count: number, practice: number, random: () => number): Trial[] {
  const presets = shuffle(PRESET_TARGETS, random);
  const free = shuffle(FREE_TARGETS, random);
  const trials: Trial[] = [];
  let start = START_VALUE;

  for (let i = 0; i < practice + count; i++) {
    const pool = i % 2 === 0 ? presets : free;
    const target = takeDistinct(pool, start);
    trials.push({ start, target, practice: i < practice });
    start = target;
  }

  return trials;
}

/** Removes and returns the first target of `pool` at least 25% away from `start`, cycling `pool` as needed. */
function takeDistinct(pool: number[], start: number): number {
  for (let tries = 0; tries < pool.length; tries++) {
    const target = pool.shift()!;
    pool.push(target);

    if (Math.max(target, start) / Math.min(target, start) >= 1.25) {
      return target;
    }
  }

  return pool[0]!;
}

/** Copy of `values` in random order. */
export function shuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }

  return copy;
}

/** Whether `value` hits `target` within the relative `tolerance`, and always within half a pixel. */
export function isHit(value: number, target: number, tolerance: number): boolean {
  return Math.abs(value - target) <= Math.max(0.5, target * tolerance);
}

/** Per-variant statistics over measured trials, fastest median first. */
export function summarize(results: readonly TrialResult[]) {
  const variants = [...new Set(results.map((result) => result.variant))];

  return variants
    .map((variant) => {
      const measured = results.filter((result) => result.variant === variant && !result.practice);
      const done = measured.filter((result) => !result.skipped);

      return {
        variant,
        trials: measured.length,
        skips: measured.length - done.length,
        medianSeconds: median(done.map((result) => result.totalMs / 1000)),
        medianManipulationSeconds: median(
          done.flatMap((result) => (result.manipulationMs === undefined ? [] : [result.manipulationMs / 1000]))
        ),
        missesPerTrial: measured.length ? measured.reduce((sum, result) => sum + result.misses, 0) / measured.length : 0
      };
    })
    .sort((a, b) => (a.medianSeconds ?? Infinity) - (b.medianSeconds ?? Infinity));
}

/** Middle value of `values`, or `undefined` for none. */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** All trials of `runs` as CSV, one row per trial with the run's settings repeated. */
export function toCsv(runs: readonly Run[]): string {
  const header = [
    'run',
    'hand',
    'tolerance',
    'dialRadius',
    'variant',
    'trial',
    'practice',
    'start',
    'target',
    'final',
    'skipped',
    'totalMs',
    'manipulationMs',
    'attempts',
    'misses',
    'pointerType'
  ];
  const rows = runs.flatMap((run) =>
    run.results.map((result) => [
      run.id,
      run.hand,
      run.tolerance,
      run.dialRadius,
      result.variant,
      result.index,
      result.practice,
      result.start,
      result.target,
      result.final,
      result.skipped,
      Math.round(result.totalMs),
      result.manipulationMs === undefined ? '' : Math.round(result.manipulationMs),
      result.attempts,
      result.misses,
      result.pointerType ?? ''
    ])
  );

  return [header, ...rows].map((row) => row.join(',')).join('\n');
}

/** `localStorage` key holding every finished run. */
const STORAGE_KEY = 'number-scrubber-benchmark/runs';

/** Runs saved on this device, oldest first; empty when storage is unreadable. */
export function loadRuns(): Run[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Run[];
  } catch {
    return [];
  }
}

/** Appends `run` to the runs saved on this device. */
export function saveRun(run: Run): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadRuns(), run]));
}

/** Forgets every saved run. */
export function clearRuns(): void {
  localStorage.removeItem(STORAGE_KEY);
}
