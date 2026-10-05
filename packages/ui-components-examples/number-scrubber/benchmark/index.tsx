import { Title } from '@solidjs/meta';
import { For, Show, createSignal } from 'solid-js';
import { BRUSH_SIZE_CURVE, BRUSH_SIZE_PRESETS } from '../brush-size';
import { NumberScrubber, type NumberScrubberProps } from '../number-scrubber';
import { Segmented } from '../segmented';
import {
  clearRuns,
  isHit,
  loadRuns,
  makeTrials,
  saveRun,
  shuffle,
  summarize,
  toCsv,
  type Run,
  type Trial
} from './trials';

/**
 * Times how fast each number-scrubber variant sets a brush size. Every variant gets two practice trials and then the
 * same measured targets, in a random variant order; results are saved on the device and can be downloaded as CSV.
 */
export default function NumberScrubberBenchmark() {
  const [phase, setPhase] = createSignal<'setup' | 'intro' | 'trial' | 'results'>('setup');
  const [chosen, setChosen] = createSignal<readonly string[]>(DEFAULT_VARIANTS);
  const [hand, setHand] = createSignal<'left' | 'right'>('left');
  const [toleranceLabel, setToleranceLabel] = createSignal<keyof typeof TOLERANCES>('5%');
  const [trialsPerVariant, setTrialsPerVariant] = createSignal(8);
  const [dialRadius, setDialRadius] = createSignal(80);
  const [savedRuns, setSavedRuns] = createSignal(loadRuns());

  // The run in progress and the trial being timed live in plain variables, which every handler must read fresh;
  // signals mirror what the screen shows.
  let run: Run | undefined;
  let plan: { variant: Variant; trials: Trial[] }[] = [];
  let shownAt = 0;
  let firstPressAt: number | undefined;
  let attempts = 0;
  let misses = 0;
  let pointerType: string | undefined;
  let committed = 0;
  const [block, setBlock] = createSignal(0);
  const [trialIndex, setTrialIndex] = createSignal(0);
  const [value, setValue] = createSignal(0);
  const [lastRun, setLastRun] = createSignal<Run>();

  const variant = () => plan[block()]?.variant;
  const trial = () => plan[block()]?.trials[trialIndex()];

  const start = () => {
    const variants = shuffle(
      VARIANTS.filter((candidate) => chosen().includes(candidate.id)),
      Math.random
    );

    if (variants.length === 0) {
      return;
    }

    // Every variant meets the same measured targets; only the practice warm-up differs.
    const measured = makeTrials(trialsPerVariant(), 0, Math.random);
    plan = variants.map((candidate) => ({
      variant: candidate,
      trials: [...makeTrials(0, PRACTICE_TRIALS, Math.random), ...measured]
    }));
    run = {
      id: new Date().toISOString(),
      hand: hand(),
      tolerance: TOLERANCES[toleranceLabel()],
      dialRadius: dialRadius(),
      order: variants.map((candidate) => candidate.id),
      results: []
    };
    setBlock(0);
    setPhase('intro');
  };

  const showTrial = (index: number) => {
    const next = plan[block()]!.trials[index]!;
    setTrialIndex(index);
    setValue(next.start);
    committed = next.start;
    shownAt = performance.now();
    firstPressAt = undefined;
    attempts = 0;
    misses = 0;
    pointerType = undefined;
    setPhase('trial');
  };

  const finishTrial = (skipped: boolean) => {
    const current = plan[block()]!;
    const index = trialIndex();
    const now = performance.now();
    run!.results.push({
      ...current.trials[index]!,
      variant: current.variant.id,
      index,
      final: committed,
      skipped,
      totalMs: now - shownAt,
      manipulationMs: skipped || firstPressAt === undefined ? undefined : now - firstPressAt,
      attempts,
      misses,
      pointerType
    });

    if (index + 1 < current.trials.length) {
      showTrial(index + 1);
    } else if (block() + 1 < plan.length) {
      setBlock(block() + 1);
      setPhase('intro');
    } else {
      finishRun();
    }
  };

  const finishRun = () => {
    saveRun(run!);
    setSavedRuns(loadRuns());
    setLastRun({ ...run! });
    setPhase('results');
  };

  const onPress = (e: PointerEvent) => {
    attempts++;
    firstPressAt ??= performance.now();
    pointerType ??= e.pointerType;
  };

  const onCommit = (next: number) => {
    setValue(next);
    committed = next;

    if (isHit(next, trial()!.target, run!.tolerance)) {
      finishTrial(false);
    } else {
      misses++;
    }
  };

  return (
    <>
      <Title>Number Scrubber Benchmark</Title>
      <div class="flex min-h-full flex-col gap-6 p-6 text-slate-700">
        <Show when={phase() === 'setup'}>
          <section class="flex max-w-2xl flex-col gap-4">
            <h1 class="text-xl font-semibold">Number scrubber benchmark</h1>
            <p class="text-sm text-slate-500">
              Set the brush size to each target as fast as you can; a commit within the tolerance finishes the trial.
              Each variant starts with {PRACTICE_TRIALS} practice trials that are not counted.
            </p>
            <div class="flex flex-col gap-2">
              <span class="text-sm font-medium">Variants</span>
              <For each={VARIANTS}>
                {(candidate) => (
                  <label class="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={chosen().includes(candidate.id)}
                      onChange={(e) =>
                        setChosen(
                          e.currentTarget.checked
                            ? [...chosen(), candidate.id]
                            : chosen().filter((id) => id !== candidate.id)
                        )
                      }
                    />
                    <span class="font-medium">{candidate.name}</span>
                    <span class="text-slate-500">— {candidate.hint}</span>
                  </label>
                )}
              </For>
            </div>
            <div class="flex flex-wrap items-center gap-6 text-sm">
              <Segmented label="Hand" options={['left', 'right'] as const} value={hand()} onChange={setHand} />
              <Segmented
                label="Tolerance"
                options={Object.keys(TOLERANCES) as (keyof typeof TOLERANCES)[]}
                value={toleranceLabel()}
                onChange={setToleranceLabel}
              />
              <label class="flex items-center gap-2">
                Trials per variant
                <input
                  class="w-16 rounded border border-slate-300 px-2 py-1"
                  type="number"
                  min="1"
                  max="20"
                  value={trialsPerVariant()}
                  onChange={(e) => setTrialsPerVariant(Math.max(1, Math.min(20, Number(e.currentTarget.value) || 8)))}
                />
              </label>
              <label class="flex items-center gap-2">
                Dial radius
                <input
                  class="w-16 rounded border border-slate-300 px-2 py-1"
                  type="number"
                  min="40"
                  max="400"
                  value={dialRadius()}
                  onChange={(e) => setDialRadius(Math.max(40, Math.min(400, Number(e.currentTarget.value) || 80)))}
                />
              </label>
            </div>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="rounded-md !bg-blue-500 px-4 py-2 text-white disabled:opacity-50"
                disabled={chosen().length === 0}
                onClick={start}
              >
                Start
              </button>
              <Show when={savedRuns().length > 0}>
                <span class="text-sm text-slate-500">{savedRuns().length} saved runs on this device</span>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-3 py-1 text-sm"
                  onClick={() => download(savedRuns())}
                >
                  Download all (CSV)
                </button>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-3 py-1 text-sm"
                  onClick={() => {
                    clearRuns();
                    setSavedRuns([]);
                  }}
                >
                  Clear
                </button>
              </Show>
            </div>
          </section>
        </Show>

        <Show when={phase() === 'intro' && variant()}>
          {(current) => (
            <section class="flex max-w-xl flex-col gap-4">
              <span class="text-sm text-slate-500">
                Variant {block() + 1} of {plan.length}
              </span>
              <h1 class="text-2xl font-semibold">{current().name}</h1>
              <p>{current().hint}</p>
              <button
                type="button"
                class="self-start rounded-md !bg-blue-500 px-4 py-2 text-white"
                onClick={() => showTrial(0)}
              >
                Begin
              </button>
            </section>
          )}
        </Show>

        <Show when={phase() === 'trial' && variant()}>
          {(current) => (
            <section class="flex flex-1 flex-col gap-6">
              <div class="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                <span>
                  {current().name} · variant {block() + 1}/{plan.length} · trial {trialIndex() + 1}/
                  {plan[block()]!.trials.length}
                </span>
                <Show when={trial()?.practice}>
                  <span class="rounded bg-amber-100 px-2 py-0.5 text-amber-800">practice</span>
                </Show>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-3 py-1"
                  onClick={() => finishTrial(true)}
                >
                  Skip
                </button>
                <button type="button" class="rounded-md border border-slate-300 px-3 py-1" onClick={finishRun}>
                  End run
                </button>
              </div>
              <div class="text-3xl">
                Set brush size to <span class="font-semibold text-blue-600 tabular-nums">{trial()?.target} px</span>
              </div>
              <div
                class={[
                  'flex h-[70vh] items-center',
                  hand() === 'left' ? 'justify-start pl-[20%]' : 'justify-end pr-[20%]'
                ]}
              >
                <div class="flex items-center gap-3 text-sm">
                  <span>Brush size</span>
                  <span onPointerDown={onPress}>
                    <NumberScrubber
                      aria-label="Brush size"
                      value={value()}
                      min={1}
                      max={5000}
                      curve={BRUSH_SIZE_CURVE}
                      displayValue={(v) => `${v}px`}
                      ruler={current().props.ruler}
                      snapStyle={current().props.snapStyle}
                      snapPoints={current().props.snapStyle ? BRUSH_SIZE_PRESETS : undefined}
                      hand={hand()}
                      radius={current().props.ruler === 'dial' ? dialRadius() : undefined}
                      onTemporaryChange={setValue}
                      onChange={onCommit}
                    />
                  </span>
                </div>
              </div>
            </section>
          )}
        </Show>

        <Show when={phase() === 'results' && lastRun()}>
          {(finished) => (
            <section class="flex max-w-3xl flex-col gap-4">
              <h1 class="text-xl font-semibold">Results</h1>
              <table class="text-sm">
                <thead class="text-left text-slate-500">
                  <tr>
                    <th class="py-1 pr-4 font-medium">Variant</th>
                    <th class="py-1 pr-4 font-medium">Median time</th>
                    <th class="py-1 pr-4 font-medium">Median handling</th>
                    <th class="py-1 pr-4 font-medium">Misses / trial</th>
                    <th class="py-1 pr-4 font-medium">Skips</th>
                    <th class="py-1 font-medium">Trials</th>
                  </tr>
                </thead>
                <tbody class="tabular-nums">
                  <For each={summarize(finished().results)}>
                    {(row) => (
                      <tr class="border-t border-slate-200">
                        <td class="py-1 pr-4">{variantName(row.variant)}</td>
                        <td class="py-1 pr-4">{seconds(row.medianSeconds)}</td>
                        <td class="py-1 pr-4">{seconds(row.medianManipulationSeconds)}</td>
                        <td class="py-1 pr-4">{row.missesPerTrial.toFixed(1)}</td>
                        <td class="py-1 pr-4">{row.skips}</td>
                        <td class="py-1">{row.trials}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <p class="text-xs text-slate-500">
                Time runs from showing the target to the hit; handling runs from the first press on the control.
                Practice trials are left out.
              </p>
              <div class="flex gap-3">
                <button
                  type="button"
                  class="rounded-md !bg-blue-500 px-4 py-2 text-white"
                  onClick={() => setPhase('setup')}
                >
                  New run
                </button>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-3 py-1 text-sm"
                  onClick={() => download([finished()])}
                >
                  Download this run (CSV)
                </button>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-3 py-1 text-sm"
                  onClick={() => download(savedRuns())}
                >
                  Download all runs (CSV)
                </button>
              </div>
            </section>
          )}
        </Show>
      </div>
    </>
  );
}

/** A scrubber configuration under test; add an entry to benchmark another one. */
type Variant = {
  id: string;
  name: string;
  /** What to do, shown before the variant's trials. */
  hint: string;
  props: Pick<NumberScrubberProps, 'ruler' | 'snapStyle'>;
};

/** Variants offered on the setup screen; presets come from CLIP STUDIO PAINT's Brush Size palette. */
const VARIANTS: readonly Variant[] = [
  {
    id: 'type',
    name: 'Type',
    hint: 'Tap the field and type the size; dragging changes it without a ruler.',
    props: { ruler: 'none' }
  },
  { id: 'line', name: 'Line', hint: 'Drag left or right along a straight ruler.', props: { ruler: 'line' } },
  { id: 'dial', name: 'Dial', hint: 'Turn the small wheel up and down.', props: { ruler: 'dial' } },
  {
    id: 'dial-dots',
    name: 'Dial + dots',
    hint: 'Turn the small wheel; on its band the value sticks to preset dots.',
    props: { ruler: 'dial', snapStyle: 'dots' }
  },
  {
    id: 'dial-panel',
    name: 'Dial + panel',
    hint: 'Release the pen on a size in the panel, or turn the wheel for sizes between presets.',
    props: { ruler: 'dial', snapStyle: 'panel' }
  },
  {
    id: 'arc-panel',
    name: 'Arc + panel',
    hint: 'Release the pen on a size in the panel, or turn the wide arc for sizes between presets.',
    props: { ruler: 'arc', snapStyle: 'panel' }
  },
  {
    id: 'vertical-dots',
    name: 'Vertical + dots',
    hint: 'Drag the tape up or down; on its band the value sticks to preset dots.',
    props: { ruler: 'vertical', snapStyle: 'dots' }
  },
  {
    id: 'grid',
    name: 'Grid',
    hint: 'Release the pen in the panel: a cell centre gives its size, between two cells you get the sizes between them.',
    props: { ruler: 'none', snapStyle: 'grid' }
  },
  {
    id: 'dial-grid',
    name: 'Dial + grid',
    hint: 'Release the pen in the grid panel, between cells for in-between sizes, or turn the wheel.',
    props: { ruler: 'dial', snapStyle: 'grid' }
  }
];

/**
 * Variants checked on the setup screen: typing as the baseline and the panels. The 2026-10-05 tablet run ruled out
 * the straight ruler, the tape, and dots on the band (given up or slowest), and the panels with presets were the
 * fastest.
 */
const DEFAULT_VARIANTS = ['type', 'dial-panel', 'arc-panel', 'grid', 'dial-grid'];

/** Warm-up trials before each variant's measured ones. */
const PRACTICE_TRIALS = 2;

/** Relative distance from the target that still counts as a hit. */
const TOLERANCES = { exact: 0, '2%': 0.02, '5%': 0.05, '10%': 0.1 } as const;

/** Display name of a variant id, falling back to the id for variants removed since a run was saved. */
function variantName(id: string): string {
  return VARIANTS.find((variant) => variant.id === id)?.name ?? id;
}

/** Seconds with one decimal, or a dash when there is no value. */
function seconds(value: number | undefined): string {
  return value === undefined ? '—' : `${value.toFixed(1)} s`;
}

/** Saves `runs` as a CSV file through the browser's download. */
function download(runs: readonly Run[]): void {
  const url = URL.createObjectURL(new Blob([toCsv(runs)], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `number-scrubber-benchmark-${new Date().toISOString().slice(0, 19)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
