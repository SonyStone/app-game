import type { PsdStateChoice, PsdStates } from '@app-game/psd/viewer';

/** Steps only within the chosen state family, wrapping when requested. Null starts with frames if available. */
export function stepState(
  states: PsdStates,
  choice: PsdStateChoice | null,
  direction: number,
  loop: boolean
): PsdStateChoice | null {
  const comps = choice !== null && 'comp' in choice;
  const entries = comps ? states.comps : states.frames.length ? states.frames : states.comps;
  const useComps = comps || !states.frames.length;
  const id = choice === null ? undefined : 'comp' in choice ? choice.comp : choice.frame;
  const index = entries.findIndex((entry) => entry.id === id);
  const next = index < 0 ? (direction > 0 ? 0 : entries.length - 1) : index + direction;
  const entry =
    entries[loop ? (next + entries.length) % entries.length : Math.max(0, Math.min(entries.length - 1, next))];
  return entry ? (useComps ? { comp: entry.id } : { frame: entry.id }) : null;
}

/** Saved hundredths-of-a-second delay, bounded to 100 ms–10 s for interactive playback. */
export function playbackDelay(states: PsdStates, choice: PsdStateChoice | null): number {
  const delay =
    choice && 'frame' in choice ? states.frames.find((frame) => frame.id === choice.frame)?.delay : undefined;
  return Math.min(10_000, Math.max(100, (delay ?? 50) * 10));
}
