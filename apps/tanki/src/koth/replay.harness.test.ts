import { describe, it } from 'vitest';
import type { createRangeRenderer } from '../damage/renderer';
import type { Rapier } from '../physics/Rapier2D';
import { applyClassTuning } from './classes/knobs';
import { CHECK_EVERY, replayRecording, type Recording } from './recording';
import { formatReport, reportOf } from './replayReport';

/**
 * Reads recorded matches without the game: for each file in `TANKI_REPLAY`, separated by commas,
 * prints what the match came to (see `reportOf`), then plays it again with this code and tells
 * whether it played the same, to the second it stopped doing so, with what only playing it shows,
 * such as how long each bot stood stuck. Ends with a `TANKI_REPORT` line of JSON per file for
 * tools. Run it with `pnpm replay <file>`, which also tells whether this code is the recording's.
 */
describe.skipIf(!import.meta.env.TANKI_REPLAY)('recorded matches', () => {
  for (const path of String(import.meta.env.TANKI_REPLAY ?? '').split(',').filter(Boolean)) {
    it(path, async () => {
      const rapier = (await import('@dimforge/rapier2d-simd/rapier.js')) as Rapier;
      const recording = JSON.parse(readText(path)) as Recording;
      const report = reportOf(recording);
      const started = performance.now();
      const played = replayRecording(rapier, fakeRenderer(), recording);
      const replay = played.replay;
      const stalls: Record<string, number> = {};
      let seconds = 0;

      // Plays a second at a time up to where it parts from the recording, after which nothing it shows is the recorded match.
      while (!played.done && played.diverged === undefined) {
        played.advance(CHECK_EVERY);
        seconds = replay.steps / 60;

        for (const bot of replay.match.bots.values()) {
          stalls[bot.member.name] = Math.max(stalls[bot.member.name] ?? 0, bot.driver.longestStall);
        }
      }

      applyClassTuning({});
      const diverged = played.diverged;
      const verdict =
        diverged === undefined
          ? `this code plays it the same: all ${recording.checks.length} checks agree`
          : `this code plays it differently from second ${diverged} on`;
      const stuck = Object.entries(stalls)
        .map(([name, seconds]) => `${name} ${seconds.toFixed(1)} s`)
        .join(', ');

      console.log(
        [
          `${path}`,
          formatReport(report),
          '',
          `replay: ${verdict} (${((performance.now() - started) / 1000).toFixed(1)} s)`,
          `longest stuck, over the first ${seconds.toFixed(0)} s: ${stuck}`,
          `TANKI_REPORT ${JSON.stringify({ path, report, replay: { diverged, played: seconds, stalls } })}`
        ].join('\n')
      );
    }, 600_000);
  }
});

/** The text of the file at `path`, read with Node's file system, which the app's types do not know. */
function readText(path: string): string {
  const process = (globalThis as unknown as { process: { getBuiltinModule: (id: string) => { readFileSync: (path: string, encoding: string) => string } } }).process;
  return process.getBuiltinModule('node:fs').readFileSync(path, 'utf8');
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
