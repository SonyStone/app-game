import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { seededRandom } from './arena';
import { createSpySandbox, type SandboxInput } from './sandbox';
import type { Variant } from './variants';

/**
 * A sandbox without a GPU, for tests and measurements: a real Rapier world and a renderer that
 * only hands out field slots and draws nothing. Free the world with `world.free()` when done.
 *
 * @param rapier - Rapier's module, loaded by the caller.
 * @param seed - Seeds the sandbox's randomness, so a run repeats exactly.
 */
export function createHeadlessSandbox(
  rapier: Rapier,
  variant: Variant,
  options: Omit<NonNullable<Parameters<typeof createSpySandbox>[3]>, 'variant' | 'random'> & { seed?: number } = {}
) {
  const world = new rapier.World({ x: 0, y: 0 });
  world.lengthUnit = 100;
  const slots = Array.from({ length: 256 }, (_, index) => 255 - index);
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
  const sandbox = createSpySandbox(rapier, world, renderer as unknown as ReturnType<typeof createRangeRenderer>, {
    ...options,
    variant,
    random: seededRandom(options.seed ?? 1)
  });

  return { sandbox, world };
}

/** Steps `sandbox` for `seconds` at 60 Hz with no player input, updating effects as a frame would. */
export function runSandbox(sandbox: ReturnType<typeof createSpySandbox>, seconds: number, input = IDLE) {
  for (let time = 0; time < seconds - 1e-9; time += STEP) {
    sandbox.step(STEP, input);
    sandbox.update(STEP);
  }
}

/** The fixed physics step, as in the page. */
export const STEP = 1 / 60;

/** No input at all. */
export const IDLE: SandboxInput = { move: { x: 0, y: 0 }, aim: undefined, fire: false, dismount: false };
